#!/usr/bin/env bash
set -euo pipefail

version='0.11.1'
asset='phpantom_lsp-wasm32-wasip1.tar.gz'
expected_sha256='611d56ee95368d10562fa2bc2e7ea145a6a02f849b2bc2950e201cfbd3c75e2b'
repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
destination="$repo_root/assets/lsp/phpantom"
archive="$(mktemp "${TMPDIR:-/tmp}/phpantom-wasm.XXXXXX.tar.gz")"
trap 'rm -f "$archive"' EXIT

mkdir -p "$destination"
curl --fail --location --retry 3 \
	"https://github.com/PHPantom-dev/phpantom_lsp/releases/download/$version/$asset" \
	--output "$archive"
actual_sha256="$(shasum -a 256 "$archive" | awk '{print $1}')"
if [[ "$actual_sha256" != "$expected_sha256" ]]; then
	printf 'PHPantom release checksum mismatch: expected %s, got %s\n' \
		"$expected_sha256" "$actual_sha256" >&2
	exit 1
fi

tar -xzf "$archive" -C "$destination" phpantom_lsp.wasm
printf 'PHPantom %s WASI reactor installed at %s\n' "$version" \
	"$destination/phpantom_lsp.wasm"
