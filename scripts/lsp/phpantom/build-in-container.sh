#!/usr/bin/env bash
set -euo pipefail

version='0.11.1'
upstream_repository='PHPantom-dev/phpantom_lsp'
upstream_commit='49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668'
upstream_archive_sha256='f5861b581a5503c7bf033df82390d08fbc9a971fa769afa90a310d0c623eb59d'
upstream_cargo_lock_sha256='0a601fc471628943f15c4e3f97649b99417b1037cf4f824bd835e8a3a12fad1d'
empty_stub_map_sha256='b74237700459662c14ba72f1666489024b9f9fc7f610be1e17391e9162eba72a'
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

PHPANTOM_BUILDER_BASE_IMAGE_REF="${PHPANTOM_BUILDER_BASE_IMAGE_REF:-${PHPANTOM_BASE_IMAGE_REF:?Docker base image pin is missing}}"
build_started_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export CARGO_TARGET_DIR='/tmp/phpantom-cargo-target'

if [[ "$build_mode" == native-test ]]; then
	for required_file in Cargo.toml Cargo.lock rust-toolchain.toml rust/phpantom-runtime-wrapper/Cargo.toml rust/vendor/phpantom_lsp/Cargo.toml rust/vendor/phpantom_lsp/stubs.lock; do
		if [[ ! -f "$required_file" ]]; then
			printf 'Required native-test source is missing: %s\n' "$required_file" >&2
			exit 1
		fi
	done

	expected_stubs_commit='2049ca3cfa1feabf52db074108fe776a5713cf02'
	expected_stubs_sha256='3ef62542d2f77ad30c7dab7dfa726e57e86dd5e3403780294119cf4f5ca6dcb7'
	stubs_lock='rust/vendor/phpantom_lsp/stubs.lock'
	stubs_commit="$(sed -n 's/^commit = "\(.*\)"$/\1/p' "$stubs_lock")"
	stubs_sha256="$(sed -n 's/^sha256 = "\(.*\)"$/\1/p' "$stubs_lock")"
	if [[ "$stubs_commit" != "$expected_stubs_commit" || "$stubs_sha256" != "$expected_stubs_sha256" ]]; then
		printf 'Local stubs.lock does not match the reviewed native-test pin.\n' >&2
		exit 1
	fi

	PHPANTOM_GIT_VERSION="$version" cargo_test_started="$SECONDS"
	export PHPANTOM_GIT_VERSION CARGO_TARGET_DIR
	cargo test --locked -p phpantom-runtime-wrapper --test public_lsp -- --nocapture
	native_test_seconds="$((SECONDS - cargo_test_started))"
	export PHPANTOM_NATIVE_TEST_SECONDS="$native_test_seconds"
	export PHPANTOM_CARGO_LOCK_SHA256="$(sha256sum Cargo.lock | awk '{print $1}')"
	export PHPANTOM_STUBS_LOCK_SHA256="$(sha256sum "$stubs_lock" | awk '{print $1}')"
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

upstream_source='/tmp/phpantom-upstream-source'
archive_path='/tmp/phpantom-upstream.tar.gz'
empty_stub_root='/tmp/phpantom-empty-stubs'
mkdir -p "$upstream_source" "$empty_stub_root"
curl --fail --location --silent --show-error \
	"https://codeload.github.com/${upstream_repository}/tar.gz/${upstream_commit}" \
	--output "$archive_path"
printf '%s  %s\n' "$upstream_archive_sha256" "$archive_path" | sha256sum --check --status || {
	printf 'Downloaded upstream archive does not match the pinned SHA-256.\n' >&2
	exit 1
}
tar -xzf "$archive_path" --strip-components=1 -C "$upstream_source"

actual_cargo_lock_sha256="$(sha256sum "$upstream_source/Cargo.lock" | awk '{print $1}')"
if [[ "$actual_cargo_lock_sha256" != "$upstream_cargo_lock_sha256" ]]; then
	printf 'Upstream Cargo.lock does not match the verified commit.\n' >&2
	exit 1
fi

cat > "$empty_stub_root/PhpStormStubsMap.php" <<'PHP'
<?php

final class PhpStormStubsMap
{
    const CLASSES = array (
    );
    const FUNCTIONS = array (
    );
    const CONSTANTS = array (
    );
}
PHP
actual_empty_stub_map_sha256="$(sha256sum "$empty_stub_root/PhpStormStubsMap.php" | awk '{print $1}')"
if [[ "$actual_empty_stub_map_sha256" != "$empty_stub_map_sha256" ]]; then
	printf 'Empty embedded stub map does not match the reviewed hash.\n' >&2
	exit 1
fi

if [[ "$(rustc --version | awk '{print $2}')" != '1.99.0' ]]; then
	printf 'Expected Rust 1.99.0 in the pinned Docker image.\n' >&2
	exit 1
fi

export PHPANTOM_STUBS_DIR="$empty_stub_root"
export PHPANTOM_GIT_VERSION="${upstream_commit:0:7}"
build_command='cargo rustc --locked --manifest-path /tmp/phpantom-upstream-source/Cargo.toml --lib --crate-type cdylib --profile wasm-release --target wasm32-wasip1'
build_started_seconds="$SECONDS"
cargo rustc --locked --manifest-path "$upstream_source/Cargo.toml" \
	--lib --crate-type cdylib --profile wasm-release --target "$target"
build_elapsed_seconds="$((SECONDS - build_started_seconds))"

wasm_path="$CARGO_TARGET_DIR/$target/wasm-release/phpantom_lsp.wasm"
if [[ ! -s "$wasm_path" ]]; then
	printf 'Cargo did not produce the expected upstream reactor module: %s\n' "$wasm_path" >&2
	exit 1
fi
wasm_sha256="$(sha256sum "$wasm_path" | awk '{print $1}')"
wasm_bytes="$(wc -c < "$wasm_path" | tr -d '[:space:]')"
cp "$wasm_path" /output/phpantom_lsp.wasm
printf '%s\n' "$wasm_sha256" > /output/phpantom_lsp.wasm.sha256

export PHPANTOM_VERSION="$version"
export PHPANTOM_SOURCE_REPOSITORY="$upstream_repository"
export PHPANTOM_UPSTREAM_COMMIT="$upstream_commit"
export PHPANTOM_UPSTREAM_ARCHIVE_SHA256="$upstream_archive_sha256"
export PHPANTOM_CARGO_LOCK_SHA256="$actual_cargo_lock_sha256"
export PHPANTOM_EMPTY_STUB_MAP_SHA256="$actual_empty_stub_map_sha256"
export PHPANTOM_TARGET="$target"
export PHPANTOM_BUILD_COMMAND="$build_command"
export PHPANTOM_BUILD_ELAPSED_SECONDS="$build_elapsed_seconds"
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
    "source_repository": os.environ["PHPANTOM_SOURCE_REPOSITORY"],
    "source_upstream_commit": os.environ["PHPANTOM_UPSTREAM_COMMIT"],
    "source_archive_sha256": os.environ["PHPANTOM_UPSTREAM_ARCHIVE_SHA256"],
    "cargo_lock_sha256": os.environ["PHPANTOM_CARGO_LOCK_SHA256"],
    "embedded_stub_map": {
        "sha256": os.environ["PHPANTOM_EMPTY_STUB_MAP_SHA256"],
        "classes": 0,
        "functions": 0,
        "constants": 0,
        "profile_data_loaded_at_runtime": True,
    },
    "rustc_verbose": os.environ["PHPANTOM_RUSTC_VERBOSE"],
    "cargo_version": os.environ["PHPANTOM_CARGO_VERSION"],
    "target": os.environ["PHPANTOM_TARGET"],
    "build_command": os.environ["PHPANTOM_BUILD_COMMAND"],
    "build_elapsed_seconds": int(os.environ["PHPANTOM_BUILD_ELAPSED_SECONDS"]),
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
Path("/output/provenance.json").write_text(json.dumps(provenance, indent=2, sort_keys=True) + "\n")
PY

printf 'WASM SHA-256: %s\n' "$wasm_sha256"
printf 'WASM bytes: %s\n' "$wasm_bytes"
