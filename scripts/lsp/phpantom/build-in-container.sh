#!/usr/bin/env bash
set -euo pipefail

version='0.11.1'
build_mode="${1:-artifact}"
if [[ "$build_mode" != artifact && "$build_mode" != native-test ]]; then
	printf 'Usage: %s [artifact|native-test]\n' "$0" >&2
	exit 2
fi
source_commit='49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668'
source_sha256='f5861b581a5503c7bf033df82390d08fbc9a971fa769afa90a310d0c623eb59d'
stubs_commit='2049ca3cfa1feabf52db074108fe776a5713cf02'
stubs_sha256='3ef62542d2f77ad30c7dab7dfa726e57e86dd5e3403780294119cf4f5ca6dcb7'
target='wasm32-wasip1'
patch_file='/opt/phpantom-runtime/patches/0001-php-version-initialize.patch'
work_dir="$(mktemp -d /tmp/phpantom-build.XXXXXX)"
trap 'rm -rf "$work_dir"' EXIT

source_archive="$work_dir/phpantom-source.tar.gz"
stubs_archive="$work_dir/phpstorm-stubs.tar.gz"
source_root="$work_dir/source"
stubs_root="$work_dir/stubs"
target_dir="$work_dir/target"

if [[ ! -d /output ]]; then
	printf 'Docker output mount /output is missing.\n' >&2
	exit 1
fi
if [[ -z "${PHPANTOM_BUILDER_IMAGE_ID:-}" || -z "${PHPANTOM_BUILDER_IMAGE_REF:-}" ]]; then
	printf 'Docker image identity environment is missing.\n' >&2
	exit 1
fi
PHPANTOM_BUILDER_BASE_IMAGE_REF="${PHPANTOM_BUILDER_BASE_IMAGE_REF:-${PHPANTOM_BASE_IMAGE_REF:?Docker base image pin is missing}}"
build_started_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

curl --fail --location --retry 3 \
	"https://github.com/PHPantom-dev/phpantom_lsp/archive/$source_commit.tar.gz" \
	--output "$source_archive"
printf '%s  %s\n' "$source_sha256" "$source_archive" | sha256sum --check --status

curl --fail --location --retry 3 \
	"https://github.com/JetBrains/phpstorm-stubs/archive/$stubs_commit.tar.gz" \
	--output "$stubs_archive"
printf '%s  %s\n' "$stubs_sha256" "$stubs_archive" | sha256sum --check --status

mkdir "$source_root" "$stubs_root"
tar -xzf "$source_archive" -C "$source_root"
tar -xzf "$stubs_archive" -C "$stubs_root"
source_dir="$(find "$source_root" -mindepth 1 -maxdepth 1 -type d -print -quit)"
stubs_dir="$(find "$stubs_root" -mindepth 1 -maxdepth 1 -type d -print -quit)"
if [[ ! -f "$source_dir/Cargo.toml" || ! -f "$source_dir/Cargo.lock" || ! -f "$stubs_dir/PhpStormStubsMap.php" ]]; then
	printf 'Pinned source or stubs archive has an unexpected layout.\n' >&2
	exit 1
fi

actual_patch_sha256="$(sha256sum "$patch_file" | awk '{print $1}')"
if [[ "$actual_patch_sha256" != "$PHPANTOM_EXPECTED_PATCH_SHA256" ]]; then
	printf 'PHPantom patch checksum mismatch: expected %s, got %s\n' \
		"$PHPANTOM_EXPECTED_PATCH_SHA256" "$actual_patch_sha256" >&2
	exit 1
fi
patch_sha256="$actual_patch_sha256"
cargo_lock_sha256="$(sha256sum "$source_dir/Cargo.lock" | awk '{print $1}')"
patch -p1 -d "$source_dir" -i "$patch_file"

cd "$source_dir"
export PHPANTOM_GIT_VERSION="$version"
export PHPANTOM_STUBS_DIR="$stubs_dir"
export CARGO_TARGET_DIR="$target_dir"

if [[ "$build_mode" == native-test ]]; then
	cargo test --locked --lib \
		parameter_version_reconstruction_tests::docblock_merge_does_not_restore_excluded_native_parameters \
		-- --nocapture
	printf 'Native parameter-version regression test succeeded.\n'
	exit 0
fi

cargo rustc --locked --lib --crate-type cdylib \
	--profile wasm-release --target "$target"

wasm_path="$target_dir/$target/wasm-release/phpantom_lsp.wasm"
wasm_sha256="$(sha256sum "$wasm_path" | awk '{print $1}')"
wasm_bytes="$(wc -c < "$wasm_path" | tr -d '[:space:]')"
cp "$wasm_path" /output/phpantom_lsp.wasm
printf '%s\n' "$wasm_sha256" > /output/phpantom_lsp.wasm.sha256

export PHPANTOM_VERSION="$version"
export PHPANTOM_SOURCE_COMMIT="$source_commit"
export PHPANTOM_SOURCE_ARCHIVE_SHA256="$source_sha256"
export PHPANTOM_STUBS_COMMIT="$stubs_commit"
export PHPANTOM_STUBS_ARCHIVE_SHA256="$stubs_sha256"
export PHPANTOM_PATCH_SHA256="$patch_sha256"
export PHPANTOM_CARGO_LOCK_SHA256="$cargo_lock_sha256"
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
    "source_commit": os.environ["PHPANTOM_SOURCE_COMMIT"],
    "source_archive_sha256": os.environ["PHPANTOM_SOURCE_ARCHIVE_SHA256"],
    "stubs_commit": os.environ["PHPANTOM_STUBS_COMMIT"],
    "stubs_archive_sha256": os.environ["PHPANTOM_STUBS_ARCHIVE_SHA256"],
    "runtime_patch_sha256": os.environ["PHPANTOM_PATCH_SHA256"],
    "cargo_lock_sha256": os.environ["PHPANTOM_CARGO_LOCK_SHA256"],
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
