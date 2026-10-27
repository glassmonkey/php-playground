#!/usr/bin/env bash
set -euo pipefail

version='0.11.1'
base_image_ref='rust:1.99.0-bookworm@sha256:114c7a4425406451c2866b6aafe69fe29b1b298832db1277d411ac73c82d04d6'
build_mode="${1:-artifact}"
if [[ "$build_mode" != artifact && "$build_mode" != native-test ]]; then
	printf 'Usage: %s [artifact|native-test]\n' "$0" >&2
	exit 2
fi
repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
script_dir="$repo_root/scripts/lsp/phpantom"
docker_bin="${DOCKER:-docker}"
output_root="${PHPANTOM_DOCKER_OUTPUT_DIR:-$repo_root/build/phpantom-docker-candidates}"
patch_file="$script_dir/patches/0001-php-version-initialize.patch"
patch_sha256="$(shasum -a 256 "$patch_file" | awk '{print $1}')"
image_tag="phpantom-runtime-builder:$version-rust1.99.0-${patch_sha256:0:12}"
attempt_id="$(date -u +%Y%m%dT%H%M%SZ)"

command -v "$docker_bin" >/dev/null 2>&1 || {
	printf 'Docker CLI is required to build PHPantom.\n' >&2
	exit 1
}

mkdir -p "$output_root"
attempt_dir="$(mktemp -d "$output_root/$attempt_id.XXXXXX")"
mkdir "$attempt_dir/output"
printf 'PHPantom Docker build attempt: %s\n' "$attempt_dir"

if "$docker_bin" build --pull \
	--build-arg "PATCH_SHA256=$patch_sha256" \
	--tag "$image_tag" \
	--file "$script_dir/Dockerfile" \
	"$script_dir" >"$attempt_dir/docker-build.log" 2>&1; then
	docker_build_status=0
else
	docker_build_status=$?
	printf '%s\n' "$docker_build_status" >"$attempt_dir/docker-build.exit"
	tail -n 80 "$attempt_dir/docker-build.log" >&2
	printf 'Docker image build failed; logs and any output are retained at %s\n' "$attempt_dir" >&2
	exit 1
fi
printf '%s\n' "$docker_build_status" >"$attempt_dir/docker-build.exit"

image_id="$("$docker_bin" image inspect --format '{{.Id}}' "$image_tag")"
image_platform="$("$docker_bin" image inspect --format '{{.Os}}/{{.Architecture}}' "$image_tag")"
docker_server_version="$("$docker_bin" version --format '{{.Server.Version}}')"

if "$docker_bin" run --rm \
	--env "PHPANTOM_BUILDER_BASE_IMAGE_REF=$base_image_ref" \
	--env "PHPANTOM_BUILDER_IMAGE_REF=$image_tag" \
	--env "PHPANTOM_BUILDER_IMAGE_ID=$image_id" \
	--env "PHPANTOM_BUILDER_IMAGE_PLATFORM=$image_platform" \
	--env "PHPANTOM_DOCKER_SERVER_VERSION=$docker_server_version" \
	--mount "type=bind,source=$attempt_dir/output,target=/output" \
	"$image_tag" "$build_mode" >"$attempt_dir/docker-run.log" 2>&1; then
	docker_run_status=0
else
	docker_run_status=$?
	printf '%s\n' "$docker_run_status" >"$attempt_dir/docker-run.exit"
	tail -n 100 "$attempt_dir/docker-run.log" >&2
	printf 'Container build failed; logs and any output are retained at %s\n' "$attempt_dir" >&2
	exit 1
fi
printf '%s\n' "$docker_run_status" >"$attempt_dir/docker-run.exit"

if [[ "$build_mode" == native-test ]]; then
	printf 'PHPantom Docker native regression test succeeded.\n'
	printf 'Docker logs: %s/docker-build.log %s/docker-run.log\n' "$attempt_dir" "$attempt_dir"
	exit 0
fi

artifact="$attempt_dir/output/phpantom_lsp.wasm"
provenance="$attempt_dir/output/provenance.json"
artifact_sha_file="$attempt_dir/output/phpantom_lsp.wasm.sha256"
if [[ ! -s "$artifact" || ! -s "$provenance" || ! -s "$artifact_sha_file" ]]; then
	printf 'Docker build did not export both the WASM and provenance; retained at %s\n' "$attempt_dir" >&2
	exit 1
fi

wasm_sha256="$(shasum -a 256 "$artifact" | awk '{print $1}')"
recorded_sha256="$(cat "$artifact_sha_file")"
if [[ "$wasm_sha256" != "$recorded_sha256" ]]; then
	printf 'Exported WASM checksum differs from provenance: %s != %s\n' \
		"$wasm_sha256" "$recorded_sha256" >&2
	exit 1
fi

printf 'PHPantom Docker build succeeded.\n'
printf 'Candidate WASM: %s\n' "$artifact"
printf 'Provenance: %s\n' "$provenance"
printf 'WASM SHA-256: %s\n' "$wasm_sha256"
printf 'Docker logs: %s/docker-build.log %s/docker-run.log\n' "$attempt_dir" "$attempt_dir"
printf 'The checked-in asset was not replaced.\n'
