#!/usr/bin/env bash
set -euo pipefail

version='0.11.1'
upstream_repository='PHPantom-dev/phpantom_lsp'
upstream_commit='49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668'
upstream_archive_sha256='f5861b581a5503c7bf033df82390d08fbc9a971fa769afa90a310d0c623eb59d'
upstream_cargo_lock_sha256='0a601fc471628943f15c4e3f97649b99417b1037cf4f824bd835e8a3a12fad1d'
expected_stubs_commit='2049ca3cfa1feabf52db074108fe776a5713cf02'
expected_stubs_sha256='3ef62542d2f77ad30c7dab7dfa726e57e86dd5e3403780294119cf4f5ca6dcb7'
phase_a_patch_sha256='9ba5fdfbe29fcfacc974611159c6aaf6bcdc15797e0e2a2c6cbf6989ad93f3d9'
reviewed_phase_b_diff_sha256='e12de7944592edf7f38fc8fcf4a5a6065468600329641bd24bb8ae48d4fd260d'
phase_b_bundle_sha256='60aad10373b97a65da73196aa28e6893a77480a21d5687ad1b140e6d74bd30a3'
phase_b_patch_sha256='4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d'
phase_b_file_manifest_sha256='b15beb40bcac3d50ab75f722c874aba5cb93dcab55aa41aef1e54108c6d35598'
patch_file='/opt/phpantom/patches/phase-b-versioned-target.patch'
file_manifest='/opt/phpantom/patches/phase-b-versioned-target.files.json'
target='wasm32-wasip1'
build_mode="${1:-artifact}"
php_target="${2:-}"
expected_stubs_tree_sha256="${PHPANTOM_EXPECTED_STUBS_TREE_SHA256:-}"

if [[ "$build_mode" != artifact && "$build_mode" != native-test ]]; then
	printf 'Usage: %s artifact <5.6|7.0-7.4|8.0-8.5> | native-test\n' "$0" >&2
	exit 2
fi
if [[ ! -d /output ]]; then
	printf 'Docker output mount /output is missing.\n' >&2
	exit 1
fi
if [[ -z "${PHPANTOM_BUILDER_IMAGE_ID:-}" || -z "${PHPANTOM_BUILDER_IMAGE_REF:-}" ]]; then
	printf 'Docker image identity environment is missing.\n' >&2
	exit 1
fi
if [[ "$build_mode" == artifact ]]; then
	case "$php_target" in
		5.6|7.0|7.1|7.2|7.3|7.4|8.0|8.1|8.2|8.3|8.4|8.5) ;;
		*) printf 'Choose an explicit target from 5.6, 7.0-7.4, or 8.0-8.5.\n' >&2; exit 2 ;;
	esac
elif [[ -n "$php_target" ]]; then
	printf 'native-test does not accept a PHP target argument.\n' >&2
	exit 2
fi

actual_patch_sha256="$(sha256sum "$patch_file" | awk '{print $1}')"
if [[ "$actual_patch_sha256" != "$phase_b_patch_sha256" ]]; then
	printf 'Phase B source patch hash mismatch: expected %s; got %s\n' \
		"$phase_b_patch_sha256" "$actual_patch_sha256" >&2
	exit 1
fi

PHPANTOM_BUILDER_BASE_IMAGE_REF="${PHPANTOM_BUILDER_BASE_IMAGE_REF:-${PHPANTOM_BASE_IMAGE_REF:?Docker base image pin is missing}}"
attempt_root="$(mktemp -d /tmp/phpantom-versioned-build.XXXXXX)"
source_root='/source/phpantom-source'
archive_path="$attempt_root/phpantom-upstream.tar.gz"
mkdir -p /source "$source_root"

curl --fail --location --silent --show-error \
	"https://codeload.github.com/${upstream_repository}/tar.gz/${upstream_commit}" \
	--output "$archive_path"
printf '%s  %s\n' "$upstream_archive_sha256" "$archive_path" | sha256sum --check --status || {
	printf 'Downloaded PHPantom source archive SHA-256 did not match the pinned commit.\n' >&2
	exit 1
}
tar -xzf "$archive_path" --strip-components=1 -C "$source_root"

actual_cargo_lock_sha256="$(sha256sum "$source_root/Cargo.lock" | awk '{print $1}')"
if [[ "$actual_cargo_lock_sha256" != "$upstream_cargo_lock_sha256" ]]; then
	printf 'Upstream Cargo.lock hash mismatch: expected %s; got %s\n' \
		"$upstream_cargo_lock_sha256" "$actual_cargo_lock_sha256" >&2
	exit 1
fi

stubs_lock="$source_root/stubs.lock"
stubs_commit="$(sed -n 's/^commit = "\(.*\)"$/\1/p' "$stubs_lock")"
stubs_sha256="$(sed -n 's/^sha256 = "\(.*\)"$/\1/p' "$stubs_lock")"
if [[ "$stubs_commit" != "$expected_stubs_commit" || "$stubs_sha256" != "$expected_stubs_sha256" ]]; then
	printf 'Upstream stubs.lock mismatch: expected %s %s; got %s %s\n' \
		"$expected_stubs_commit" "$expected_stubs_sha256" "$stubs_commit" "$stubs_sha256" >&2
	exit 1
fi

patch --dry-run --batch --forward -p1 -d "$source_root" -i "$patch_file"
patch --batch --forward -p1 -d "$source_root" -i "$patch_file"
if [[ ! -f "$source_root/build_support/stub_since.rs" || ! -f "$source_root/tests/native_versioned_embedded.rs" ]]; then
	printf 'Complete Phase B patch is missing its scanner helper or focused native test.\n' >&2
	exit 1
fi
actual_file_manifest_sha256="$(sha256sum "$file_manifest" | awk '{print $1}')"
if [[ "$actual_file_manifest_sha256" != "$phase_b_file_manifest_sha256" ]]; then
	printf 'Phase B applied-source manifest hash mismatch: expected %s; got %s\n' \
		"$phase_b_file_manifest_sha256" "$actual_file_manifest_sha256" >&2
	exit 1
fi
python3 - "$source_root" "$file_manifest" "$actual_patch_sha256" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

source_root = Path(sys.argv[1])
manifest_path = Path(sys.argv[2])
patch_sha256 = sys.argv[3]
manifest = json.loads(manifest_path.read_text())
if manifest["completePatchSha256"] != patch_sha256:
    raise SystemExit("applied-source manifest refers to a different patch")
if manifest["upstreamCommit"] != "49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668":
    raise SystemExit("applied-source manifest refers to a different upstream commit")
if manifest["fileCount"] != len(manifest["files"]):
    raise SystemExit("applied-source manifest file count is inconsistent")
for entry in manifest["files"]:
    path = source_root / entry["path"]
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != entry["sha256"]:
        raise SystemExit(f"patched source differs from frozen Phase B: {entry['path']}")
print(f"Verified {manifest['fileCount']} patched source files against the frozen Phase B manifest.")
PY

source_cargo_lock_sha256="$actual_cargo_lock_sha256"
stubs_lock_sha256="$(sha256sum "$stubs_lock" | awk '{print $1}')"
build_started_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
build_identity="49b9a751-phase-b-e12de794"
export PHPANTOM_GIT_VERSION="$build_identity"
unset PHPANTOM_STUBS_DIR

if [[ "$build_mode" == native-test ]]; then
	native_probe="$attempt_root/phpantom-native-probe"
	mkdir -p "$native_probe"
	cp -R /opt/phpantom/native-probe/. "$native_probe/"
	if [[ "$(rustc --version | awk '{print $2}')" != '1.99.0' ]]; then
		printf 'Expected Rust 1.99.0 in the digest-pinned builder.\n' >&2
		exit 1
	fi

	behavior_log='/output/native-versioned-embedded.log'
	expected_failure='PHP 7.4 same-name user documentation marker (known baseline)'
	behavior_started="$SECONDS"
	set +e
	PHPANTOM_TARGET_PHP_VERSION=7.4 cargo test --locked \
		--manifest-path "$native_probe/Cargo.toml" \
		--test native_versioned_embedded -- --nocapture >"$behavior_log" 2>&1
	behavior_exit=$?
	set -e
	if [[ "$behavior_exit" -ne 101 ]] \
		|| ! grep -Fq "$expected_failure" "$behavior_log" \
		|| ! grep -Eq '6 passed; 1 failed' "$behavior_log"; then
		tail -n 100 "$behavior_log" >&2
		printf 'Native public probe differed from the accepted 6/7 + known docs baseline.\n' >&2
		exit 1
	fi

	guard_log='/output/native-profile-guards.log'
	PHPANTOM_TARGET_PHP_VERSION=7.4 cargo test --locked \
		--manifest-path "$native_probe/Cargo.toml" \
		--test native_profile_guards -- --nocapture >"$guard_log" 2>&1
	rustc --edition=2024 --test "$source_root/build_support/stub_since.rs" \
		-o "$attempt_root/stub-since-tests"
	"$attempt_root/stub-since-tests" > /output/stub-since-tests.log 2>&1
	native_test_seconds="$((SECONDS - behavior_started))"
	export PHPANTOM_NATIVE_TEST_SECONDS="$native_test_seconds"
	export PHPANTOM_BEHAVIOR_EXIT="$behavior_exit"
	export PHPANTOM_CARGO_LOCK_SHA256="$(sha256sum "$native_probe/Cargo.lock" | awk '{print $1}')"
	export PHPANTOM_SOURCE_CARGO_LOCK_SHA256="$source_cargo_lock_sha256"
	export PHPANTOM_PHASE_A_PATCH_SHA256="$phase_a_patch_sha256"
	export PHPANTOM_REVIEWED_PHASE_B_DIFF_SHA256="$reviewed_phase_b_diff_sha256"
	export PHPANTOM_PHASE_B_PATCH_SHA256="$actual_patch_sha256"
	export PHPANTOM_PHASE_B_FILE_MANIFEST_SHA256="$actual_file_manifest_sha256"
	export PHPANTOM_BUILD_IDENTITY="$build_identity"
	export PHPANTOM_STUBS_LOCK_SHA256="$stubs_lock_sha256"
	export PHPANTOM_RUSTC_VERBOSE="$(rustc --version --verbose)"
	export PHPANTOM_CARGO_VERSION="$(cargo --version)"
	export PHPANTOM_BUILDER_BASE_IMAGE_REF
	export PHPANTOM_BUILDER_IMAGE_REF PHPANTOM_BUILDER_IMAGE_ID
	export PHPANTOM_BUILDER_IMAGE_PLATFORM PHPANTOM_DOCKER_SERVER_VERSION
	export PHPANTOM_DOCKER_CONTEXT PHPANTOM_DOCKER_ENDPOINT
	python3 - <<'PY'
import json
import os
from pathlib import Path

summary = {
    "source": {
        "repository": "PHPantom-dev/phpantom_lsp",
        "commit": "49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668",
        "archive_sha256": "f5861b581a5503c7bf033df82390d08fbc9a971fa769afa90a310d0c623eb59d",
        "cargo_lock_sha256": os.environ["PHPANTOM_SOURCE_CARGO_LOCK_SHA256"],
        "phase_a_patch_sha256": os.environ["PHPANTOM_PHASE_A_PATCH_SHA256"],
        "reviewed_phase_b_diff_sha256": os.environ["PHPANTOM_REVIEWED_PHASE_B_DIFF_SHA256"],
        "phase_b_patch_sha256": os.environ["PHPANTOM_PHASE_B_PATCH_SHA256"],
        "file_manifest_sha256": os.environ["PHPANTOM_PHASE_B_FILE_MANIFEST_SHA256"],
    },
    "stubs": {
        "commit": "2049ca3cfa1feabf52db074108fe776a5713cf02",
        "archive_sha256": "3ef62542d2f77ad30c7dab7dfa726e57e86dd5e3403780294119cf4f5ca6dcb7",
        "lock_sha256": "" + os.environ.get("PHPANTOM_STUBS_LOCK_SHA256", ""),
    },
    "native_probe": {
        "php_target": "7.4",
        "build_identity": os.environ["PHPANTOM_BUILD_IDENTITY"],
        "command": "cargo test --locked --manifest-path <native-probe>/Cargo.toml --test native_versioned_embedded -- --nocapture",
        "exit_code": int(os.environ["PHPANTOM_BEHAVIOR_EXIT"]),
        "result": "6/7 passed; the sole failure is the preserved same-name user documentation marker baseline",
        "log": "native-versioned-embedded.log",
    },
    "guards": {
        "command": "cargo test --locked --manifest-path <native-probe>/Cargo.toml --test native_profile_guards -- --nocapture",
        "result": "2/2 passed",
        "log": "native-profile-guards.log",
    },
    "scanner_test": {
        "command": "rustc --edition=2024 --test <patched-source>/build_support/stub_since.rs",
        "result": "1/1 passed",
        "log": "stub-since-tests.log",
    },
    "rustc_verbose": os.environ["PHPANTOM_RUSTC_VERBOSE"],
    "cargo_version": os.environ["PHPANTOM_CARGO_VERSION"],
    "docker": {
        "base_image_ref": os.environ["PHPANTOM_BUILDER_BASE_IMAGE_REF"],
        "builder_image_ref": os.environ["PHPANTOM_BUILDER_IMAGE_REF"],
        "builder_image_id": os.environ["PHPANTOM_BUILDER_IMAGE_ID"],
        "platform": os.environ["PHPANTOM_BUILDER_IMAGE_PLATFORM"],
        "server_version": os.environ["PHPANTOM_DOCKER_SERVER_VERSION"],
        "context": os.environ["PHPANTOM_DOCKER_CONTEXT"],
        "endpoint": os.environ["PHPANTOM_DOCKER_ENDPOINT"],
    },
    "elapsed_seconds": int(os.environ["PHPANTOM_NATIVE_TEST_SECONDS"]),
}
Path("/output/native-test.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
PY
	printf 'Native probe recorded: 6/7 with one known baseline docs failure; guards 2/2; scanner 1/1.\n'
	exit 0
fi

if [[ -z "$php_target" ]]; then
	printf 'PHP target is required for artifact builds.\n' >&2
	exit 2
fi
export PHPANTOM_TARGET_PHP_VERSION="$php_target"
export PHPANTOM_TARGET="$php_target"
export PHPANTOM_SOURCE_REPOSITORY="$upstream_repository"
export PHPANTOM_UPSTREAM_COMMIT="$upstream_commit"
export PHPANTOM_UPSTREAM_ARCHIVE_SHA256="$upstream_archive_sha256"
export PHPANTOM_UPSTREAM_CARGO_LOCK_SHA256="$source_cargo_lock_sha256"
export PHPANTOM_STUBS_COMMIT="$stubs_commit"
export PHPANTOM_STUBS_ARCHIVE_SHA256="$stubs_sha256"
export PHPANTOM_STUBS_LOCK_SHA256="$stubs_lock_sha256"
export PHPANTOM_PHASE_A_PATCH_SHA256="$phase_a_patch_sha256"
export PHPANTOM_PHASE_B_DIFF_SHA256="$reviewed_phase_b_diff_sha256"
export PHPANTOM_PHASE_B_BUNDLE_SHA256="$phase_b_bundle_sha256"
export PHPANTOM_PHASE_B_PATCH_SHA256="$actual_patch_sha256"
export PHPANTOM_PHASE_B_FILE_MANIFEST_SHA256="$actual_file_manifest_sha256"
export PHPANTOM_SOURCE_CARGO_LOCK_SHA256="$source_cargo_lock_sha256"
export PHPANTOM_STUBS_RESOLVED_COMMIT="$stubs_commit"
export PHPANTOM_STUBS_LOCK_SHA256="$stubs_lock_sha256"
export PHPANTOM_BUILD_IDENTITY="$build_identity"
export PHPANTOM_RUSTC_VERBOSE="$(rustc --version --verbose)"
export PHPANTOM_CARGO_VERSION="$(cargo --version)"
export PHPANTOM_WASM_TARGET="$target"
export PHPANTOM_BUILD_STARTED_UTC="$build_started_utc"
export PHPANTOM_BUILDER_BASE_IMAGE_REF
export PHPANTOM_BUILDER_IMAGE_REF PHPANTOM_BUILDER_IMAGE_ID
export PHPANTOM_BUILDER_IMAGE_PLATFORM PHPANTOM_DOCKER_SERVER_VERSION
export PHPANTOM_DOCKER_CONTEXT PHPANTOM_DOCKER_ENDPOINT

export CARGO_HOME=/cache
export CARGO_TARGET_DIR=/out/target
mkdir -p "$CARGO_HOME" /out "$CARGO_TARGET_DIR"
if [[ -n "$expected_stubs_tree_sha256" && ! "$expected_stubs_tree_sha256" =~ ^[a-f0-9]{64}$ ]]; then
	printf 'Expected stubs tree SHA-256 has an invalid format.\n' >&2
	exit 1
fi
shopt -s nullglob
cached_stubs_markers=("$CARGO_TARGET_DIR/$target/wasm-release/build/phpantom_lsp-"*/out/stubs/jetbrains/phpstorm-stubs/.commit)
if [[ "${#cached_stubs_markers[@]}" -eq 0 ]]; then
	if [[ -n "$expected_stubs_tree_sha256" ]]; then
		printf 'Expected a warmed stubs OUT_DIR but found no commit marker.\n' >&2
		exit 1
	fi
	printf 'Prebuild stub-cache check: no existing OUT_DIR marker; first build must fetch the pinned archive.\n'
elif [[ "${#cached_stubs_markers[@]}" -eq 1 ]]; then
	cached_stubs_root="$(dirname "${cached_stubs_markers[0]}")"
	cached_stubs_commit="$(cat "${cached_stubs_markers[0]}")"
	if [[ "$cached_stubs_commit" != "$stubs_commit" ]]; then
		printf 'Prebuild stub-cache commit mismatch: expected %s; got %s\n' "$stubs_commit" "$cached_stubs_commit" >&2
		exit 1
	fi
	cached_tree_sha256="$(python3 - "$cached_stubs_root" <<'PY'
import hashlib
import sys
from pathlib import Path

root = Path(sys.argv[1])
digest = hashlib.sha256()
for path in sorted((entry for entry in root.rglob('*') if entry.is_file()), key=lambda item: item.relative_to(root).as_posix()):
    relative = path.relative_to(root).as_posix().encode()
    digest.update(relative + b'\0' + hashlib.sha256(path.read_bytes()).digest() + b'\n')
print(digest.hexdigest())
PY
)
	if [[ -z "$expected_stubs_tree_sha256" || "$cached_tree_sha256" != "$expected_stubs_tree_sha256" ]]; then
		printf 'Prebuild stub-cache tree SHA-256 mismatch: expected %s; got %s\n' \
			"${expected_stubs_tree_sha256:-<no prior verified tree>}" "$cached_tree_sha256" >&2
		exit 1
	fi
	printf 'Prebuild stub-cache check: full commit %s, tree SHA-256 %s.\n' "$cached_stubs_commit" "$cached_tree_sha256"
else
	printf 'Expected one cached stubs OUT_DIR marker; found %s.\n' "${#cached_stubs_markers[@]}" >&2
	exit 1
fi
build_command="CARGO_HOME=$CARGO_HOME CARGO_TARGET_DIR=$CARGO_TARGET_DIR PHPANTOM_TARGET_PHP_VERSION=$php_target PHPANTOM_GIT_VERSION=$build_identity cargo rustc --locked --manifest-path $source_root/Cargo.toml --lib --crate-type cdylib --profile wasm-release --target $target"
export PHPANTOM_BUILD_COMMAND="$build_command"
build_started_seconds="$SECONDS"
cargo rustc --locked --manifest-path "$source_root/Cargo.toml" \
	--lib --crate-type cdylib --profile wasm-release --target "$target"
build_elapsed_seconds="$((SECONDS - build_started_seconds))"

shopt -s nullglob
stubs_markers=("$CARGO_TARGET_DIR/$target/wasm-release/build/phpantom_lsp-"*/out/stubs/jetbrains/phpstorm-stubs/.commit)
resolved_stubs_commit=''
if [[ "${#stubs_markers[@]}" -eq 1 ]]; then
	resolved_stubs_commit="$(cat "${stubs_markers[0]}")"
fi
if [[ "${#stubs_markers[@]}" -ne 1 || "$resolved_stubs_commit" != "$stubs_commit" ]]; then
	printf 'Cargo did not resolve the exact full phpstorm-stubs pin.\n' >&2
	exit 1
fi
stubs_root="$(dirname "${stubs_markers[0]}")"
stubs_map="$stubs_root/PhpStormStubsMap.php"
if [[ ! -s "$stubs_map" ]]; then
	printf 'Verified phpstorm-stubs tree has no nonempty PhpStormStubsMap.php.\n' >&2
	exit 1
fi
stubs_map_sha256="$(sha256sum "$stubs_map" | awk '{print $1}')"
stubs_file_count="$(find "$stubs_root" -type f | wc -l | tr -d '[:space:]')"
stubs_tree_sha256="$(python3 - "$stubs_root" <<'PY'
import hashlib
import sys
from pathlib import Path

root = Path(sys.argv[1])
digest = hashlib.sha256()
for path in sorted((entry for entry in root.rglob('*') if entry.is_file()), key=lambda item: item.relative_to(root).as_posix()):
    relative = path.relative_to(root).as_posix().encode()
    digest.update(relative + b'\0' + hashlib.sha256(path.read_bytes()).digest() + b'\n')
print(digest.hexdigest())
PY
)"
if [[ -n "$expected_stubs_tree_sha256" && "$stubs_tree_sha256" != "$expected_stubs_tree_sha256" ]]; then
	printf 'Postbuild stubs tree SHA-256 mismatch: expected %s; got %s\n' \
		"$expected_stubs_tree_sha256" "$stubs_tree_sha256" >&2
	exit 1
fi
printf 'Verified full stubs marker %s; archive SHA-256 %s; map SHA-256 %s; files %s.\n' \
	"$resolved_stubs_commit" "$stubs_sha256" "$stubs_map_sha256" "$stubs_file_count"
wasm_path="$CARGO_TARGET_DIR/$target/wasm-release/phpantom_lsp.wasm"
if [[ ! -s "$wasm_path" ]]; then
	printf 'Cargo did not produce the expected upstream WASI reactor: %s\n' "$wasm_path" >&2
	exit 1
fi
wasm_sha256="$(sha256sum "$wasm_path" | awk '{print $1}')"
wasm_bytes="$(wc -c < "$wasm_path" | tr -d '[:space:]')"
cp "$wasm_path" /output/phpantom_lsp.wasm
printf '%s\n' "$wasm_sha256" > /output/phpantom_lsp.wasm.sha256
export PHPANTOM_WASM_SHA256="$wasm_sha256"
export PHPANTOM_WASM_BYTES="$wasm_bytes"
export PHPANTOM_STUBS_RESOLVED_COMMIT="$resolved_stubs_commit"
export PHPANTOM_STUBS_MAP_SHA256="$stubs_map_sha256"
export PHPANTOM_STUBS_FILE_COUNT="$stubs_file_count"
export PHPANTOM_STUBS_TREE_SHA256="$stubs_tree_sha256"
export PHPANTOM_STUBS_OUT_DIR="$stubs_root"
export PHPANTOM_BUILD_ELAPSED_SECONDS="$build_elapsed_seconds"
export PHPANTOM_ARTIFACT_GENERATED_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
python3 - <<'PY'
import json
import os
from pathlib import Path

provenance = {
    "schemaVersion": 1,
    "phase": "B",
    "phpTarget": os.environ["PHPANTOM_TARGET_PHP_VERSION"],
    "buildIdentity": os.environ["PHPANTOM_BUILD_IDENTITY"],
    "source": {
        "repository": os.environ["PHPANTOM_SOURCE_REPOSITORY"],
        "commit": os.environ["PHPANTOM_UPSTREAM_COMMIT"],
        "archiveSha256": os.environ["PHPANTOM_UPSTREAM_ARCHIVE_SHA256"],
        "cargoLockSha256": os.environ["PHPANTOM_UPSTREAM_CARGO_LOCK_SHA256"],
        "reviewedPhaseADiffSha256": os.environ["PHPANTOM_PHASE_A_PATCH_SHA256"],
        "reviewedPhaseBDiffSha256": os.environ["PHPANTOM_PHASE_B_DIFF_SHA256"],
        "reviewedPhaseBBundleSha256": os.environ["PHPANTOM_PHASE_B_BUNDLE_SHA256"],
        "appliedPhaseBPatchSha256": os.environ["PHPANTOM_PHASE_B_PATCH_SHA256"],
        "appliedFileManifestSha256": os.environ["PHPANTOM_PHASE_B_FILE_MANIFEST_SHA256"],
    },
    "stubs": {
        "repository": "JetBrains/phpstorm-stubs",
        "commit": os.environ["PHPANTOM_STUBS_COMMIT"],
        "archiveSha256": os.environ["PHPANTOM_STUBS_ARCHIVE_SHA256"],
        "resolvedCommitMarker": os.environ["PHPANTOM_STUBS_RESOLVED_COMMIT"],
        "mapSha256": os.environ["PHPANTOM_STUBS_MAP_SHA256"],
        "fileCount": int(os.environ["PHPANTOM_STUBS_FILE_COUNT"]),
        "treeSha256": os.environ["PHPANTOM_STUBS_TREE_SHA256"],
        "outDir": os.environ["PHPANTOM_STUBS_OUT_DIR"],
        "lockSha256": os.environ["PHPANTOM_STUBS_LOCK_SHA256"],
        "fullEmbeddedStubs": True,
    },
    "build": {
        "command": os.environ["PHPANTOM_BUILD_COMMAND"],
        "target": os.environ["PHPANTOM_WASM_TARGET"],
        "rustcVerbose": os.environ["PHPANTOM_RUSTC_VERBOSE"],
        "cargoVersion": os.environ["PHPANTOM_CARGO_VERSION"],
        "elapsedSeconds": int(os.environ["PHPANTOM_BUILD_ELAPSED_SECONDS"]),
        "startedUtc": os.environ["PHPANTOM_BUILD_STARTED_UTC"],
        "finishedUtc": os.environ["PHPANTOM_ARTIFACT_GENERATED_UTC"],
    },
    "docker": {
        "baseImageRef": os.environ["PHPANTOM_BUILDER_BASE_IMAGE_REF"],
        "builderImageRef": os.environ["PHPANTOM_BUILDER_IMAGE_REF"],
        "builderImageId": os.environ["PHPANTOM_BUILDER_IMAGE_ID"],
        "platform": os.environ["PHPANTOM_BUILDER_IMAGE_PLATFORM"],
        "serverVersion": os.environ["PHPANTOM_DOCKER_SERVER_VERSION"],
        "context": os.environ["PHPANTOM_DOCKER_CONTEXT"],
        "endpoint": os.environ["PHPANTOM_DOCKER_ENDPOINT"],
    },
    "artifact": {
        "path": "phpantom_lsp.wasm",
        "sha256": os.environ["PHPANTOM_WASM_SHA256"],
        "bytes": int(os.environ["PHPANTOM_WASM_BYTES"]),
    },
}
Path("/output/provenance.json").write_text(json.dumps(provenance, indent=2, sort_keys=True) + "\n")
PY
printf 'Candidate PHP %s WASI build complete: %s bytes, SHA-256 %s\n' \
	"$php_target" "$wasm_bytes" "$wasm_sha256"
