#!/usr/bin/env bash
set -euo pipefail

version='0.11.1'
base_image_ref='rust:1.99.0-bookworm@sha256:114c7a4425406451c2866b6aafe69fe29b1b298832db1277d411ac73c82d04d6'
build_mode="${1:-artifact}"
php_target="${2:-}"
if [[ "$build_mode" != artifact && "$build_mode" != native-test ]]; then
	printf 'Usage: %s artifact <7.4|8.0|8.3|8.5> | native-test\n' "$0" >&2
	exit 2
fi
if [[ "$build_mode" == artifact ]]; then
	case "$php_target" in
		7.4|8.0|8.3|8.5) ;;
		*) printf 'Choose an explicitly tested PHP target: 7.4, 8.0, 8.3, or 8.5.\n' >&2; exit 2 ;;
	esac
elif [[ -n "$php_target" ]]; then
	printf 'native-test does not accept a PHP target.\n' >&2
	exit 2
fi

repo_root="$(cd "$(dirname "$0")/../../.." && pwd -P)"
script_dir="$repo_root/scripts/lsp/phpantom"
docker_bin="${DOCKER:-docker}"
output_root="${PHPANTOM_DOCKER_OUTPUT_DIR:-$repo_root/build/phpantom-docker-candidates}"
image_tag="phpantom-runtime-builder:$version-rust1.99.0-phase-b"
attempt_id="$(date -u +%Y%m%dT%H%M%SZ)"

command -v "$docker_bin" >/dev/null 2>&1 || {
	printf 'Docker CLI is required to build PHPantom.\n' >&2
	exit 1
}

mkdir -p "$output_root"
output_root="$(cd "$output_root" && pwd -P)"
attempt_dir="$(mktemp -d "$output_root/$attempt_id.XXXXXX")"
mkdir "$attempt_dir/output"
printf 'PHPantom Docker build attempt: %s\n' "$attempt_dir"

if "$docker_bin" build \
	--tag "$image_tag" \
	--file "$script_dir/Dockerfile" \
	"$repo_root" >"$attempt_dir/docker-build.log" 2>&1; then
	docker_build_status=0
else
	docker_build_status=$?
	printf '%s\n' "$docker_build_status" >"$attempt_dir/docker-build.exit"
	tail -n 100 "$attempt_dir/docker-build.log" >&2
	printf 'Docker image build failed; retained at %s\n' "$attempt_dir" >&2
	exit 1
fi
printf '%s\n' "$docker_build_status" >"$attempt_dir/docker-build.exit"

image_id="$("$docker_bin" image inspect --format '{{.Id}}' "$image_tag")"
image_platform="$("$docker_bin" image inspect --format '{{.Os}}/{{.Architecture}}' "$image_id")"
docker_server_version="$("$docker_bin" version --format '{{.Server.Version}}')"
docker_context="$("$docker_bin" context show)"
docker_endpoint="$("$docker_bin" context inspect "$docker_context" --format '{{(index .Endpoints "docker").Host}}')"
if [[ -z "$image_id" || "$image_platform" != linux/* ]]; then
	printf 'Could not verify the built Linux image identity/platform.\n' >&2
	exit 1
fi

run_args=(run --rm
	--env "PHPANTOM_BASE_IMAGE_REF=$base_image_ref"
	--env "PHPANTOM_BUILDER_IMAGE_REF=$image_tag"
	--env "PHPANTOM_BUILDER_IMAGE_ID=$image_id"
	--env "PHPANTOM_BUILDER_IMAGE_PLATFORM=$image_platform"
	--env "PHPANTOM_DOCKER_SERVER_VERSION=$docker_server_version"
	--env "PHPANTOM_DOCKER_CONTEXT=$docker_context"
	--env "PHPANTOM_DOCKER_ENDPOINT=$docker_endpoint"
	--mount "type=bind,source=$attempt_dir/output,target=/output")
if [[ "$build_mode" == artifact ]]; then
	run_args+=("$image_id" artifact "$php_target")
else
	run_args+=("$image_id" native-test)
fi

if "$docker_bin" "${run_args[@]}" >"$attempt_dir/docker-run.log" 2>&1; then
	docker_run_status=0
else
	docker_run_status=$?
	printf '%s\n' "$docker_run_status" >"$attempt_dir/docker-run.exit"
	tail -n 120 "$attempt_dir/docker-run.log" >&2
	printf 'Container command failed; logs and output are retained at %s\n' "$attempt_dir" >&2
	exit 1
fi
printf '%s\n' "$docker_run_status" >"$attempt_dir/docker-run.exit"

if [[ "$build_mode" == native-test ]]; then
	if [[ ! -s "$attempt_dir/output/native-test.json" ]]; then
		printf 'Native test command exited 0 without its summary; retained at %s\n' "$attempt_dir" >&2
		exit 1
	fi
	printf 'Native regression probe completed; expected docs-marker failure remains recorded.\n'
	printf 'Summary: %s/output/native-test.json\n' "$attempt_dir"
	printf 'Logs: %s/output/*.log %s/docker-{build,run}.log\n' "$attempt_dir" "$attempt_dir"
	exit 0
fi

artifact="$attempt_dir/output/phpantom_lsp.wasm"
provenance="$attempt_dir/output/provenance.json"
artifact_sha_file="$attempt_dir/output/phpantom_lsp.wasm.sha256"
if [[ ! -s "$artifact" || ! -s "$provenance" || ! -s "$artifact_sha_file" ]]; then
	printf 'Docker build did not export WASM, provenance, and checksum; retained at %s\n' "$attempt_dir" >&2
	exit 1
fi

wasm_sha256="$(shasum -a 256 "$artifact" | awk '{print $1}')"
recorded_sha256="$(cat "$artifact_sha_file")"
if [[ "$wasm_sha256" != "$recorded_sha256" ]]; then
	printf 'Exported WASM checksum differs from container record: %s != %s\n' \
		"$wasm_sha256" "$recorded_sha256" >&2
	exit 1
fi
recorded_target="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["phpTarget"])' "$provenance")"
if [[ "$recorded_target" != "$php_target" ]]; then
	printf 'Provenance target mismatch: requested %s, recorded %s\n' "$php_target" "$recorded_target" >&2
	exit 1
fi

printf 'PHP %s Docker build succeeded.\n' "$php_target"
printf 'Candidate WASM: %s\n' "$artifact"
printf 'Provenance: %s\n' "$provenance"
printf 'WASM SHA-256: %s\n' "$wasm_sha256"
printf 'Builder: %s (%s, %s)\n' "$image_tag" "$image_id" "$image_platform"
printf 'Docker context: %s (%s), server %s\n' "$docker_context" "$docker_endpoint" "$docker_server_version"
printf 'Docker logs: %s/docker-build.log %s/docker-run.log\n' "$attempt_dir" "$attempt_dir"
printf 'The checked-in asset was not replaced.\n'
