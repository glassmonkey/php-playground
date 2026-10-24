# Docker build benchmark

`scripts/benchmark-docker-build.py` runs one controlled build case at a time. It accepts an immutable source context and records its full Git SHA, the linked input SHA, PHP/Emscripten versions, resolved base-image digest, host and builder details, command, duration, BuildKit cache events, provenance metadata, and the matching raw log. It never removes images, prunes cache, edits source assets, or changes the caller's Docker context.

The results directory is an experiment boundary: use a new empty directory for every run. A run writes `results.json`, `raw/<phase>-NN.log`, and any Buildx metadata JSON. Failed runs retain their logs and produce a failed summary with no successful median. Warmup is recorded separately and excluded from the measured median.

## Prepare immutable inputs

Use separate clean worktrees or exported trees for baseline and candidate. Do not point a run at a worktree that another process is editing. Keep the PHP source ref and Emscripten version identical across the comparison. Supply the full commit SHA as `--source-sha`; supply a full Git tree/object SHA for the linked inputs as `--input-sha` (for example, the tree SHA of `src/wasm/build-assets`). Record any non-Git generated input separately in the input hash before building.

Resolve the Dockerfile's `FROM` image to an immutable `sha256:` digest and pass it as `--base-image-digest`. With Buildx provenance enabled, retain and inspect the per-build `.metadata.json` alongside the raw BuildKit log. Verify its material digest against this declared value before treating the comparison as controlled. The harness records this declaration; it cannot prove that a mutable `FROM` reference resolved to the declared digest by itself.

Create a dedicated Buildx builder for this experiment, named `gla96-bench-<experiment>`, with the requested platform and CPU/memory allocation. Do not use the shared default builder. Keep the same builder configuration for baseline and candidate. The harness records the builder's inspect output hash and the human-readable CPU allocation; it does not reconfigure the host or builder. Use unique result directories and the default unique image tags. No cache is pruned or imported from another builder.

For this repository, use the `src/wasm` directory as context and its `Dockerfile`. The Makefile build arguments should be passed explicitly when needed, for example:

```sh
--build-arg WITH_VRZNO=yes \
--build-arg WITH_LIBXML=no \
--build-arg WITH_LIBPNG=no \
--build-arg WITH_MBSTRING=yes \
--build-arg WITH_CLI_SAPI=no \
--build-arg WITH_OPENSSL=no \
--build-arg WITH_NODEFS=no \
--build-arg WITH_CURL=no \
--build-arg WITH_SQLITE=no \
--build-arg WITH_MYSQL=no \
--build-arg WITH_WS_NETWORKING_PROXY=no \
--build-arg EMSCRIPTEN_ENVIRONMENT=web
```

## Modes and repeat counts

Each invocation measures one PHP version and one immutable context.

* `cold`: `--no-cache` is set on every measured build. Use at least one sample for 5.6, 7.4, and 8.5 for both baseline and candidate.
* `warm`: an uncounted warmup build runs first, then at least three measured builds use the same builder cache and inputs.
* `php-version`: an uncounted warmup builds a different PHP version from the same context, then at least three measured builds use the target version. This captures version-switch rebuild behavior.
* `link-input-change`: an uncounted warmup uses the previous linked-input context/ref, then at least three measured builds use the changed linked inputs. Provide the warmup context, source SHA, and input SHA explicitly.

The warmup compiles the context into the same dedicated builder cache, so include its PHP/source/input identity in the run record. Do not compare medians unless baseline and candidate have identical source SHA, Emscripten version, base-image digest, host/architecture, platform, and CPU allocation for the relevant case. The PHP version and input SHA should differ only for the scenario deliberately varying that input. Keep cold and cached measurements separate.

Example dry run (does not invoke Docker or create the output directory):

```sh
python3 scripts/benchmark-docker-build.py \
  --context /immutable/baseline/src/wasm \
  --dockerfile Dockerfile \
  --source-sha <full-source-sha> \
  --input-sha <full-linked-input-tree-sha> \
  --php-version 7.4 \
  --emsdk-version 4.0.22 \
  --base-image-digest sha256:<64-hex-digits> \
  --platform linux/arm64 \
  --cpu-allocation '4 CPUs reserved; builder limit=4' \
  --builder gla96-bench-pr405 \
  --mode cold --samples 1 \
  --output /tmp/gla96-baseline-74-cold \
  --dry-run
```

Remove `--dry-run` only after the manager has provided the baseline/candidate SHAs and resource allocation. Run the same command for the candidate using a separate output directory, preserving all other controlled values. For repeatable modes, set `--samples 3` or higher. Never launch the baseline and candidate builds concurrently.

## Reviewing the evidence

Check every `results.json` has `summary.status=succeeded` and the expected number of measured records. Confirm each record points to an existing raw log and metadata file, each process exit code is zero, and the Buildx metadata's materials include the declared base digest. Failed builds are retained and make the run exit nonzero; do not remove failures or compute a successful comparison from only the surviving samples.

The reported duration is wall-clock time for the `docker buildx build` process. `cache_hits` counts BuildKit log steps explicitly marked `CACHED`; `completed_steps` counts steps marked `DONE`. The event list includes the step number/detail from the corresponding raw log. Review stage labels and logs to identify which build stages reran; do not interpret the count as a complete list of rebuilt stages. Summarize each controlled case with median duration/cache hits/completed steps, alongside all raw observations and provenance. Do not combine the cold and warm medians.

This harness does not claim an optimization from dry runs or simulated command failures. The actual baseline/candidate Docker builds and their resulting logs/metadata are required evidence.
