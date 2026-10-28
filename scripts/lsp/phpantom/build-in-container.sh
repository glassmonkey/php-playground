#!/usr/bin/env bash
set -euo pipefail

version='0.11.1'
upstream_commit='49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668'
source_snapshot_reference='506d253c5ee27bfc3c51fb2541d3e8d819bb4622'
expected_stubs_commit='2049ca3cfa1feabf52db074108fe776a5713cf02'
expected_stubs_sha256='3ef62542d2f77ad30c7dab7dfa726e57e86dd5e3403780294119cf4f5ca6dcb7'
target='wasm32-wasip1'
build_mode="${1:-artifact}"

if [[ "$build_mode" != artifact && "$build_mode" != native-test ]]; then
	printf 'Usage: %s [artifact|native-test]\n' "$0" >&2
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

wrapper_manifest='rust/phpantom-runtime-wrapper/Cargo.toml'
phpantom_manifest='rust/vendor/phpantom_lsp/Cargo.toml'
stubs_lock='rust/vendor/phpantom_lsp/stubs.lock'
for required_file in Cargo.toml Cargo.lock rust-toolchain.toml "$wrapper_manifest" "$phpantom_manifest" "$stubs_lock"; do
	if [[ ! -f "$required_file" ]]; then
		printf 'Required local Cargo source is missing: %s\n' "$required_file" >&2
		exit 1
	fi
done

stubs_commit="$(sed -n 's/^commit = "\(.*\)"$/\1/p' "$stubs_lock")"
stubs_sha256="$(sed -n 's/^sha256 = "\(.*\)"$/\1/p' "$stubs_lock")"
if [[ "$stubs_commit" != "$expected_stubs_commit" || "$stubs_sha256" != "$expected_stubs_sha256" ]]; then
	printf 'Local stubs.lock does not match the reviewed pin.\n' >&2
	printf 'Expected %s %s; got %s %s\n' \
		"$expected_stubs_commit" "$expected_stubs_sha256" "$stubs_commit" "$stubs_sha256" >&2
	exit 1
fi

cargo_lock_sha256="$(sha256sum Cargo.lock | awk '{print $1}')"
stubs_lock_sha256="$(sha256sum "$stubs_lock" | awk '{print $1}')"
source_fingerprint="$(python3 - <<'PY'
from hashlib import sha256
from pathlib import Path

files = [Path("Cargo.toml"), Path("Cargo.lock"), Path("rust-toolchain.toml")]
files.extend(path for path in Path("rust").rglob("*") if path.is_file())
files = sorted(set(files), key=lambda path: path.as_posix())

fingerprint = sha256()
for path in files:
    digest = sha256(path.read_bytes()).digest()
    fingerprint.update(path.as_posix().encode("utf-8"))
    fingerprint.update(b"\0")
    fingerprint.update(digest)
print(fingerprint.hexdigest())
PY
)"

PHPANTOM_BUILDER_BASE_IMAGE_REF="${PHPANTOM_BUILDER_BASE_IMAGE_REF:-${PHPANTOM_BASE_IMAGE_REF:?Docker base image pin is missing}}"
build_started_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export PHPANTOM_GIT_VERSION="$version"
export CARGO_TARGET_DIR="/tmp/phpantom-cargo-target"

if [[ "$build_mode" == native-test ]]; then
	native_test_started="$SECONDS"
	cargo test --locked -p phpantom-runtime-wrapper --test public_lsp -- --nocapture
	native_test_seconds="$((SECONDS - native_test_started))"
	export PHPANTOM_NATIVE_TEST_SECONDS="$native_test_seconds"
	export PHPANTOM_SOURCE_FINGERPRINT="$source_fingerprint"
	export PHPANTOM_SOURCE_SNAPSHOT_REFERENCE="$source_snapshot_reference"
	export PHPANTOM_CARGO_LOCK_SHA256="$cargo_lock_sha256"
	export PHPANTOM_STUBS_LOCK_SHA256="$stubs_lock_sha256"
	export PHPANTOM_STUBS_COMMIT="$stubs_commit"
	export PHPANTOM_STUBS_ARCHIVE_SHA256="$stubs_sha256"
	export PHPANTOM_RUSTC_VERBOSE="$(rustc --version --verbose)"
	export PHPANTOM_CARGO_VERSION="$(cargo --version)"
	export PHPANTOM_BUILDER_BASE_IMAGE_REF
	export PHPANTOM_DOCKER_SERVER_VERSION
	python3 - <<'PY'
import json
import os
from pathlib import Path

summary = {
    "command": "cargo test --locked -p phpantom-runtime-wrapper --test public_lsp -- --nocapture",
    "source_fingerprint": os.environ["PHPANTOM_SOURCE_FINGERPRINT"],
    "source_snapshot_reference": os.environ["PHPANTOM_SOURCE_SNAPSHOT_REFERENCE"],
    "cargo_lock_sha256": os.environ["PHPANTOM_CARGO_LOCK_SHA256"],
    "stubs_lock_sha256": os.environ["PHPANTOM_STUBS_LOCK_SHA256"],
    "stubs_commit": os.environ["PHPANTOM_STUBS_COMMIT"],
    "stubs_archive_sha256": os.environ["PHPANTOM_STUBS_ARCHIVE_SHA256"],
    "rustc_verbose": os.environ["PHPANTOM_RUSTC_VERBOSE"],
    "cargo_version": os.environ["PHPANTOM_CARGO_VERSION"],
    "docker": {
        "base_image_ref": os.environ["PHPANTOM_BUILDER_BASE_IMAGE_REF"],
        "builder_image_ref": os.environ["PHPANTOM_BUILDER_IMAGE_REF"],
        "builder_image_id": os.environ["PHPANTOM_BUILDER_IMAGE_ID"],
        "platform": os.environ["PHPANTOM_BUILDER_IMAGE_PLATFORM"],
        "server_version": os.environ["PHPANTOM_DOCKER_SERVER_VERSION"],
    },
    "elapsed_seconds": int(os.environ["PHPANTOM_NATIVE_TEST_SECONDS"]),
}
Path("/output/native-test.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
PY
	printf 'PHPantom public native LSP regression suite succeeded in %s seconds.\n' "$native_test_seconds"
	exit 0
fi

cargo build --locked -p phpantom-runtime-wrapper \
	--profile wasm-release --target "$target"

wasm_path="$CARGO_TARGET_DIR/$target/wasm-release/phpantom_runtime_wrapper.wasm"
if [[ ! -s "$wasm_path" ]]; then
	printf 'Cargo did not produce the expected wrapper module: %s\n' "$wasm_path" >&2
	exit 1
fi
wasm_sha256="$(sha256sum "$wasm_path" | awk '{print $1}')"
wasm_bytes="$(wc -c < "$wasm_path" | tr -d '[:space:]')"
cp "$wasm_path" /output/phpantom_lsp.wasm
printf '%s\n' "$wasm_sha256" > /output/phpantom_lsp.wasm.sha256

export PHPANTOM_VERSION="$version"
export PHPANTOM_UPSTREAM_COMMIT="$upstream_commit"
export PHPANTOM_SOURCE_SNAPSHOT_REFERENCE="$source_snapshot_reference"
export PHPANTOM_SOURCE_FINGERPRINT="$source_fingerprint"
export PHPANTOM_CARGO_LOCK_SHA256="$cargo_lock_sha256"
export PHPANTOM_STUBS_COMMIT="$stubs_commit"
export PHPANTOM_STUBS_ARCHIVE_SHA256="$stubs_sha256"
export PHPANTOM_STUBS_LOCK_SHA256="$stubs_lock_sha256"
export PHPANTOM_TARGET="$target"
export PHPANTOM_RUSTC_VERBOSE="$(rustc --version --verbose)"
export PHPANTOM_CARGO_VERSION="$(cargo --version)"
export PHPANTOM_WASM_SHA256="$wasm_sha256"
export PHPANTOM_WASM_BYTES="$wasm_bytes"
export PHPANTOM_BUILD_STARTED_UTC="$build_started_utc"
export PHPANTOM_ARTIFACT_GENERATED_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export PHPANTOM_BUILDER_BASE_IMAGE_REF
export PHPANTOM_BUILDER_IMAGE_PLATFORM
export PHPANTOM_DOCKER_SERVER_VERSION

python3 - <<'PY'
import json
import os
from pathlib import Path

provenance = {
    "phpantom_version": os.environ["PHPANTOM_VERSION"],
    "source_repository": "php-playground",
    "source_path": "rust/vendor/phpantom_lsp",
    "source_upstream_commit": os.environ["PHPANTOM_UPSTREAM_COMMIT"],
    "source_snapshot_reference": os.environ["PHPANTOM_SOURCE_SNAPSHOT_REFERENCE"],
    "source_fingerprint": os.environ["PHPANTOM_SOURCE_FINGERPRINT"],
    "cargo_lock_sha256": os.environ["PHPANTOM_CARGO_LOCK_SHA256"],
    "stubs": {
        "commit": os.environ["PHPANTOM_STUBS_COMMIT"],
        "archive_sha256": os.environ["PHPANTOM_STUBS_ARCHIVE_SHA256"],
        "lock_sha256": os.environ["PHPANTOM_STUBS_LOCK_SHA256"],
    },
    "rustc_verbose": os.environ["PHPANTOM_RUSTC_VERBOSE"],
    "cargo_version": os.environ["PHPANTOM_CARGO_VERSION"],
    "target": os.environ["PHPANTOM_TARGET"],
    "docker": {
        "base_image_ref": os.environ["PHPANTOM_BUILDER_BASE_IMAGE_REF"],
        "builder_image_ref": os.environ["PHPANTOM_BUILDER_IMAGE_REF"],
        "builder_image_id": os.environ["PHPANTOM_BUILDER_IMAGE_ID"],
        "platform": os.environ["PHPANTOM_BUILDER_IMAGE_PLATFORM"],
        "server_version": os.environ["PHPANTOM_DOCKER_SERVER_VERSION"],
    },
    "build_started_utc": os.environ["PHPANTOM_BUILD_STARTED_UTC"],
    "artifact_generated_utc": os.environ["PHPANTOM_ARTIFACT_GENERATED_UTC"],
    "artifact": {
        "file": "phpantom_lsp.wasm",
        "bytes": int(os.environ["PHPANTOM_WASM_BYTES"]),
        "sha256": os.environ["PHPANTOM_WASM_SHA256"],
    },
}
Path("/output/provenance.json").write_text(
    json.dumps(provenance, indent=2, sort_keys=True) + "\n"
)
PY

printf 'WASM SHA-256: %s\n' "$wasm_sha256"
printf 'WASM bytes: %s\n' "$wasm_bytes"
