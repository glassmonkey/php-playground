#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
version=2026.10.07.0
expected_sha256=b28bf6166e016d539fc2f2aec18ef918b12590e436a6f1ccbdf30b5bbdbdb16b
asset_dir="$root/assets/lsp/phpactor"
build_dir="$asset_dir/.build"
image=phpactor-emscripten:4.0.22

command -v curl >/dev/null
command -v php >/dev/null
command -v docker >/dev/null

mkdir -p "$build_dir"
trap 'rm -rf "$build_dir"' EXIT

curl -fL --retry 2 \
	"https://github.com/phpactor/phpactor/releases/download/$version/phpactor.phar" \
	-o "$build_dir/phpactor.phar"
actual_sha256=$(shasum -a 256 "$build_dir/phpactor.phar" | awk '{print $1}')
if [[ "$actual_sha256" != "$expected_sha256" ]]; then
	echo "Phpactor PHAR SHA-256 mismatch: $actual_sha256" >&2
	exit 1
fi

php -r '$phar = new Phar($argv[1]); $phar->extractTo($argv[2], null, true);' \
	"$build_dir/phpactor.phar" "$build_dir/phpactor-root"
mkdir -p "$build_dir/cache-home"
XDG_CACHE_HOME="$build_dir/cache-home" php \
	"$root/scripts/lsp/phpactor/prepare-stub-map.php" \
	"$build_dir/phpactor-root" "$build_dir/cache-root"

if ! docker image inspect "$image" >/dev/null 2>&1; then
	docker build \
		--file "$root/src/wasm/Dockerfile" \
		--target emscripten \
		--build-arg EMSDK_VERSION=4.0.22 \
		--tag "$image" \
		"$root/src/wasm"
fi

docker run --rm \
	-v "$build_dir:/input:ro" \
	-v "$asset_dir:/output" \
	"$image" \
	python3 /root/emsdk/upstream/emscripten/tools/file_packager.py \
	/output/phpactor.data \
	--preload /input/phpactor-root@/phpactor /input/cache-root@/cache \
	--js-output=/output/phpactor-loader.js \
	--export-es6 \
	--quiet

echo "Generated assets/lsp/phpactor/phpactor.data and phpactor-loader.js for Phpactor $version"
