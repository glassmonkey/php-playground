#!/usr/bin/env bash
set -euo pipefail

version='0.11.1'
commit='49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668'
source_sha256='f5861b581a5503c7bf033df82390d08fbc9a971fa769afa90a310d0c623eb59d'
stubs_commit='2049ca3cfa1feabf52db074108fe776a5713cf02'
stubs_sha256='3ef62542d2f77ad30c7dab7dfa726e57e86dd5e3403780294119cf4f5ca6dcb7'
repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/phpantom-build.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT
source_archive="$work_dir/phpantom-source.tar.gz"
stubs_archive="$work_dir/phpstorm-stubs.tar.gz"
source_root="$work_dir/source"
stubs_root="$work_dir/stubs"
target_dir="${CARGO_TARGET_DIR:-$work_dir/target}"

curl --fail --location --retry 3 \
	"https://github.com/PHPantom-dev/phpantom_lsp/archive/$commit.tar.gz" \
	--output "$source_archive"
actual_source_sha256="$(shasum -a 256 "$source_archive" | awk '{print $1}')"
if [[ "$actual_source_sha256" != "$source_sha256" ]]; then
	printf 'PHPantom source checksum mismatch: expected %s, got %s\n' \
		"$source_sha256" "$actual_source_sha256" >&2
	exit 1
fi

curl --fail --location --retry 3 \
	"https://github.com/JetBrains/phpstorm-stubs/archive/$stubs_commit.tar.gz" \
	--output "$stubs_archive"
actual_stubs_sha256="$(shasum -a 256 "$stubs_archive" | awk '{print $1}')"
if [[ "$actual_stubs_sha256" != "$stubs_sha256" ]]; then
	printf 'phpstorm-stubs checksum mismatch: expected %s, got %s\n' \
		"$stubs_sha256" "$actual_stubs_sha256" >&2
	exit 1
fi

mkdir "$source_root" "$stubs_root"
tar -xzf "$source_archive" -C "$source_root"
tar -xzf "$stubs_archive" -C "$stubs_root"
source_dir="$(find "$source_root" -mindepth 1 -maxdepth 1 -type d -print -quit)"
stubs_dir="$(find "$stubs_root" -mindepth 1 -maxdepth 1 -type d -print -quit)"
if [[ ! -f "$source_dir/Cargo.toml" || ! -f "$stubs_dir/PhpStormStubsMap.php" ]]; then
	printf 'Pinned PHPantom source or phpstorm-stubs archive has an unexpected layout.\n' >&2
	exit 1
fi

patch -p1 -d "$source_dir" \
	-i "$repo_root/scripts/lsp/phpantom/patches/0001-php-version-initialize.patch"

(
	cd "$source_dir"
	PHPANTOM_GIT_VERSION="$version" \
	PHPANTOM_STUBS_DIR="$stubs_dir" \
	CARGO_TARGET_DIR="$target_dir" \
	"${CARGO:-cargo}" rustc --locked --lib --crate-type cdylib \
		--profile wasm-release --target wasm32-wasip1
)

output="$target_dir/wasm32-wasip1/wasm-release/phpantom_lsp.wasm"
wasm_output="${PHPANTOM_WASM_OUTPUT:-$repo_root/assets/lsp/phpantom/phpantom_lsp.wasm}"
mkdir -p "$(dirname "$wasm_output")"
cp "$output" "$wasm_output"
printf 'Built PHPantom %s with PHP-version initialization at %s\n' \
	"$version" "$wasm_output"
