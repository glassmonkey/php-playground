#!/usr/bin/env bash
set -euo pipefail

version='0.11.1'
commit='49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668'
source_sha256='f5861b581a5503c7bf033df82390d08fbc9a971fa769afa90a310d0c623eb59d'
repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/phpantom-build.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT
archive="$work_dir/phpantom-source.tar.gz"

curl --fail --location --retry 3 \
	"https://github.com/PHPantom-dev/phpantom_lsp/archive/$commit.tar.gz" \
	--output "$archive"
actual_sha256="$(shasum -a 256 "$archive" | awk '{print $1}')"
if [[ "$actual_sha256" != "$source_sha256" ]]; then
	printf 'PHPantom source checksum mismatch: expected %s, got %s\n' \
		"$source_sha256" "$actual_sha256" >&2
	exit 1
fi

mkdir "$work_dir/source"
tar -xzf "$archive" -C "$work_dir/source"
source_dir="$(find "$work_dir/source" -mindepth 1 -maxdepth 1 -type d -print -quit)"
if [[ ! -f "$source_dir/Cargo.toml" ]]; then
	printf 'PHPantom source archive did not contain Cargo.toml\n' >&2
	exit 1
fi

(
	cd "$source_dir"
	PHPANTOM_GIT_VERSION="$version" \
	CARGO_TARGET_DIR="$work_dir/target" \
	cargo rustc --locked --lib --crate-type cdylib \
		--profile wasm-release --target wasm32-wasip1
)

mkdir -p "$repo_root/assets/lsp/phpantom"
cp "$work_dir/target/wasm32-wasip1/wasm-release/phpantom_lsp.wasm" \
	"$repo_root/assets/lsp/phpantom/phpantom_lsp.wasm"
printf 'Built PHPantom %s WASI reactor at %s\n' "$version" \
	"$repo_root/assets/lsp/phpantom/phpantom_lsp.wasm"
