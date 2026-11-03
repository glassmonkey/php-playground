#!/usr/bin/env bash
set -euo pipefail

version='0.11.1'
base_image_ref='rust:1.99.0-bookworm@sha256:114c7a4425406451c2866b6aafe69fe29b1b298832db1277d411ac73c82d04d6'
build_mode="${1:-artifact}"
php_target="${2:-}"
if [[ "$build_mode" != artifact && "$build_mode" != native-test ]]; then
	printf 'Usage: %s artifact <5.6|7.0-7.4|8.0-8.5> | native-test\n' "$0" >&2
	exit 2
fi
if [[ "$build_mode" == artifact ]]; then
	case "$php_target" in
		5.6|7.0|7.1|7.2|7.3|7.4|8.0|8.1|8.2|8.3|8.4|8.5) ;;
		*) printf 'Choose a PHP target from 5.6, 7.0-7.4, or 8.0-8.5.\n' >&2; exit 2 ;;
	esac
elif [[ -n "$php_target" ]]; then
	printf 'native-test does not accept a PHP target.\n' >&2
	exit 2
fi

repo_root="$(cd "$(dirname "$0")/../../.." && pwd -P)"
script_dir="$repo_root/scripts/lsp/phpantom"
docker_bin="${DOCKER:-docker}"
output_root="${PHPANTOM_DOCKER_OUTPUT_DIR:-$repo_root/build/phpantom-docker-candidates}"
matrix_cache="${PHPANTOM_DOCKER_MATRIX_CACHE_DIR:-$output_root/shared-rust1.99-cache}"
candidate_root="$repo_root/build/phpantom-versioned-candidates"
image_tag="phpantom-runtime-builder:$version-rust1.99.0-phase-b"
attempt_id="$(date -u +%Y%m%dT%H%M%SZ)"

command -v "$docker_bin" >/dev/null 2>&1 || {
	printf 'Docker CLI is required to build PHPantom.\n' >&2
	exit 1
}

mkdir -p "$output_root"
output_root="$(cd "$output_root" && pwd -P)"
mkdir -p "$matrix_cache"
matrix_cache="$(cd "$matrix_cache" && pwd -P)"
lock_dir="$matrix_cache/.matrix-build-lock"
if ! mkdir "$lock_dir" 2>/dev/null; then
	printf 'Another matrix operation holds the shared Cargo cache lock: %s\n' "$lock_dir" >&2
	exit 1
fi
trap 'rmdir "$lock_dir"' EXIT
mkdir -p "$matrix_cache/cache" "$matrix_cache/out-target"

expected_stubs_tree_sha256=''
wasm_target_cache="$matrix_cache/out-target/wasm32-wasip1"
if [[ -f "$matrix_cache/stubs-tree.sha256" ]]; then
	expected_stubs_tree_sha256="$(cat "$matrix_cache/stubs-tree.sha256")"
elif find "$wasm_target_cache" -mindepth 1 -print -quit 2>/dev/null | grep -q .; then
	printf 'WASI target cache is populated but has no verified stubs tree record; refusing reuse.\n' >&2
	exit 1
fi

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
	--mount "type=bind,source=$attempt_dir/output,target=/output"
	--mount "type=bind,source=$matrix_cache/cache,target=/cache"
	--mount "type=bind,source=$matrix_cache/out-target,target=/out/target")
if [[ -n "$expected_stubs_tree_sha256" ]]; then
	run_args+=(--env "PHPANTOM_EXPECTED_STUBS_TREE_SHA256=$expected_stubs_tree_sha256")
fi
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
if ! grep -Fq 'Compiling phpantom_lsp' "$attempt_dir/docker-run.log"; then
	printf 'Cargo did not rebuild phpantom_lsp for the selected PHP target; retained at %s\n' "$attempt_dir" >&2
	exit 1
fi
provenance_check="$(python3 - "$provenance" "$php_target" <<'PY'
import json
import sys
from pathlib import Path

manifest = json.loads(Path(sys.argv[1]).read_text())
target = sys.argv[2]
assert manifest["phase"] == "B"
assert manifest["phpTarget"] == target
assert manifest["build"]["target"] == "wasm32-wasip1"
assert f"PHPANTOM_TARGET_PHP_VERSION={target}" in manifest["build"]["command"]
assert "--target wasm32-wasip1" in manifest["build"]["command"]
assert manifest["source"]["commit"] == "49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668"
assert manifest["source"]["archiveSha256"] == "f5861b581a5503c7bf033df82390d08fbc9a971fa769afa90a310d0c623eb59d"
assert manifest["source"]["cargoLockSha256"] == "0a601fc471628943f15c4e3f97649b99417b1037cf4f824bd835e8a3a12fad1d"
assert manifest["source"]["appliedPhaseBPatchSha256"] == "4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d"
assert manifest["source"]["appliedFileManifestSha256"] == "b15beb40bcac3d50ab75f722c874aba5cb93dcab55aa41aef1e54108c6d35598"
assert manifest["stubs"]["commit"] == "2049ca3cfa1feabf52db074108fe776a5713cf02"
assert manifest["stubs"]["resolvedCommitMarker"] == manifest["stubs"]["commit"]
assert manifest["stubs"]["archiveSha256"] == "3ef62542d2f77ad30c7dab7dfa726e57e86dd5e3403780294119cf4f5ca6dcb7"
assert manifest["stubs"]["fullEmbeddedStubs"] is True
print(manifest["stubs"]["treeSha256"])
PY
)"
if [[ -z "$expected_stubs_tree_sha256" ]]; then
	printf '%s\n' "$provenance_check" >"$matrix_cache/stubs-tree.sha256"
elif [[ "$provenance_check" != "$expected_stubs_tree_sha256" ]]; then
	printf 'Candidate stubs tree differs from the verified shared cache.\n' >&2
	exit 1
fi

candidate_dir="$candidate_root/$php_target/$wasm_sha256"
mkdir -p "$(dirname "$candidate_dir")"
if ! mkdir "$candidate_dir"; then
	printf 'Immutable candidate already exists; refusing overwrite: %s\n' "$candidate_dir" >&2
	exit 1
fi
cp "$artifact" "$candidate_dir/phpantom_lsp.wasm"
cp "$provenance" "$candidate_dir/provenance.json"
cp "$artifact_sha_file" "$candidate_dir/phpantom_lsp.wasm.sha256"
for existing_artifact in "$candidate_root"/*/*/phpantom_lsp.wasm; do
	[[ -f "$existing_artifact" ]] || continue
	existing_sha256="$(shasum -a 256 "$existing_artifact" | awk '{print $1}')"
	existing_target="$(basename "$(dirname "$(dirname "$existing_artifact")")")"
	if [[ "$existing_target" != "$php_target" && "$existing_sha256" == "$wasm_sha256" ]]; then
		printf 'Distinct PHP targets produced the same WASM hash (%s and %s, %s); stop for review.\n' \
			"$existing_target" "$php_target" "$wasm_sha256" >&2
		exit 1
	fi
done

if node "$repo_root/scripts/lsp/phpantom/versioned-wasi-test.mjs" "$candidate_dir/provenance.json" \
	>"$candidate_dir/versioned-wasi-test.log" 2>&1; then
	wasi_test_status=0
	printf '%s\n' "$wasi_test_status" >"$candidate_dir/versioned-wasi-test.exit"
else
	wasi_test_status=$?
	printf '%s\n' "$wasi_test_status" >"$candidate_dir/versioned-wasi-test.exit"
	tail -n 60 "$candidate_dir/versioned-wasi-test.log" >&2
	printf 'Required WASI behavior failed for PHP %s; candidate retained at %s\n' "$php_target" "$candidate_dir" >&2
	exit 1
fi

printf 'PHP %s Docker build succeeded.\n' "$php_target"
printf 'Candidate WASM: %s\n' "$artifact"
printf 'Provenance: %s\n' "$provenance"
printf 'WASM SHA-256: %s\n' "$wasm_sha256"
printf 'Immutable candidate and WASI log: %s\n' "$candidate_dir"
printf 'Verified shared stubs tree SHA-256: %s\n' "$provenance_check"
printf 'Builder: %s (%s, %s)\n' "$image_tag" "$image_id" "$image_platform"
printf 'Docker context: %s (%s), server %s\n' "$docker_context" "$docker_endpoint" "$docker_server_version"
printf 'Docker logs: %s/docker-build.log %s/docker-run.log\n' "$attempt_dir" "$attempt_dir"
printf 'The checked-in asset was not replaced.\n'
