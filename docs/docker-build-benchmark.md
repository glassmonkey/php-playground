# Docker build benchmark

`scripts/benchmark-docker-build.py` exports a Docker context directly from an immutable Git commit and records its repository revision separately from the upstream `php-src` commit, Emsdk manager revision, resolved Emscripten SDK release, and base-image digest. The Dockerfile verifies the PHP and Emsdk Git checkouts against the supplied full commit SHAs and prints the resolved commits and active SDK in the raw BuildKit log. Buildx provenance and the resolved base material are retained for independent review.

The harness records a Git tree SHA for the Docker context and linked build inputs, an SHA-256 for the exported context tar, and a raw log plus Buildx metadata file for each build. It atomically writes immutable `inputs.json` with every scheduled argv, tag, context hash, resource readback and log path before the first build; it atomically writes `results.json` with exit codes and start/end UTC times after execution. `results.json` links the input-manifest SHA. Successful summaries report median, min/max/range and median absolute deviation; fewer than three measured samples are marked `insufficient_samples` for variability. Cache hits and completed (non-cached) stages are reported separately. `cold` uses `--no-cache`; cached modes perform an uncounted warmup first. A failed build makes the summary fail and produces no successful median.

## Fixed inputs

For each PHP version, pin the **same upstream PHP source commit** in baseline and candidate. `--repo-revision` identifies the app repository build definition and may differ between baseline and candidate. `--php-source-sha` identifies the PHP source checkout and must remain the same for the same PHP version. The default `--input-path` tree SHA is derived from Git, not supplied as a label. `git archive` exports the exact repository revision to an isolated context before Buildx reads it; dirty worktree files cannot enter the build.

Pass a full Emsdk manager repo SHA and an exact SDK version. The reference manifest records the current resolved manager commit and the SDK release that the pinned manifest maps from `latest`; the benchmark commands use the exact release number so the Dockerfile and result JSON agree. Pass the actual Ubuntu multi-platform image index digest; Buildx provenance must show the expected arm64 material selected from that index.

Every benchmark invocation must pass the explicit default web feature values from the Makefile, including `WITH_LIBZIP=no` and `EMSCRIPTEN_ENVIRONMENT=web`. The harness rejects omitted or conflicting values, stores the effective map and its SHA-256 in every run, and prints it during dry-run. Baseline and candidate results are comparable only when these feature signatures match. Historical builds without explicit feature args remain correctness/reference evidence.

The Docker daemon reports a 2-CPU, 6,209,429,504-byte VM. The dedicated `gla96-a3c1` Docker-container builder is limited to cpuset `0-1`, CPU quota 200,000/100,000 (2 CPUs), 5 GiB memory, and one parallel BuildKit step. Each build `RUN` step is limited to cpuset `0-1` and 4 GiB. These are Docker/Buildx container limits; no host-wide reservation is made. The harness reads the daemon and builder container limits before building and fails if they do not match the declared configuration.

Use the same builder and resource settings for baseline and candidate. The builder owns an isolated cache; do not prune it, use the shared default builder, delete existing images, or build concurrently with another heavy Docker task. Every experiment uses a new output directory. The result archive, raw logs, metadata and unique tags are retained; builds do not load images or write generated assets into the repository.

## Scenarios and repetitions

Each invocation measures one PHP version from one immutable repository revision.

* `cold`: `--no-cache` is set for each measured build. Run at least one sample for 5.6, 7.4, and 8.5 on both baseline and candidate.
* `warm`: the same inputs build once as an uncounted prime, followed by at least three measured cached builds. The harness rejects fewer than three measured samples.
* `php-version`: before **each** measured target build, prime the builder with the specified other PHP version and its pinned PHP source commit. The results retain an ordered prime/target pair for every measured sample. The builder cache is never cleared; records distinguish versions already built in this invocation from cache state that may predate it. Repeated switches after both versions have been built are warm-switch measurements and cannot be presented as first-visit target rebuild cost.
* `link-input-change`: run one invocation per immutable linked-input variant. Each invocation primes its unchanged parent revision once, then measures the same PHP target once. The harness requires a variant ID and exactly one measured sample per invocation. Use three distinct, behavior-equivalent comment-only variants of `build-assets/php_wasm.c`, with each variant applied identically to baseline and candidate and recorded by immutable repository ref, exported context hash, parent/target blob IDs, and stable patch ID. The harness rejects variants that change another file under the linked-input tree. Alternate which side runs first across the three pairs. Do not reuse a variant for a second measured sample; that target would already be cached. Do not delete cache or use an artificial forced miss.

Compare baseline and candidate only when the per-version PHP source SHA, Emsdk repo SHA and release version, base-image digest, host/architecture, platform and resource limits match. The app repository revision and linked-input tree are expected to differ when code changes. Keep cold and cached measurements separate. The actual resolved PHP/Emsdk refs must appear in build logs; declared result metadata alone is not proof.

For a clean speedup claim on this 8-CPU host, require matching dedicated-builder limits (2 CPUs, 5 GiB, one BuildKit step; 4 GiB per build step), no overlapping shared-host bulk cleanup or other heavy build, and load-average samples (1, 5 and 15 minutes) no greater than 4.0 immediately before and after each run. Corresponding baseline/candidate samples must differ by no more than 2.0 in each load average. These are classification thresholds, not a gate on running required builds: retain noisy results and label them reference-only. Alternate baseline/candidate order across PHP versions and repeated scenario blocks; report all samples, median, range, median absolute deviation, cache hits/misses and rebuilt stages.

Example dry run (validates Git revisions/tree IDs and arguments; does not create output files or invoke Docker):

```sh
python3 scripts/benchmark-docker-build.py \
  --repo-root "$PWD" \
  --repo-revision <full-repository-commit-sha> \
  --php-source-sha <full-php-src-commit-sha-for-7.4> \
  --emsdk-repo-sha d7b4130688bfa348392b921ab04015aa15c4f154 \
  --php-version 7.4 \
  --emsdk-version 6.0.13 \
  --base-image-digest sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac \
  --platform linux/arm64 \
  --cpu-allocation 'Docker VM=2 CPUs; builder cpuset=0-1; quota=200000/100000' \
  --memory-allocation 'VM=6209429504 bytes; builder=5368709120 bytes; build-step=4g; parallelism=1' \
  --build-resource cpuset-cpus=0-1 --build-resource memory=4g \
  --builder gla96-a3c1 --builder-cpu-set 0-1 --builder-cpu-quota 200000 \
  --builder-memory-bytes 5368709120 \
  --mode cold --samples 1 --output /tmp/gla96-baseline-74-cold --dry-run
```

Add these explicit web feature args to each invocation using the Makefile values:

```sh
  --build-arg WITH_VRZNO=yes --build-arg WITH_LIBXML=no \
  --build-arg WITH_LIBPNG=no --build-arg WITH_LIBZIP=no \
  --build-arg WITH_MBSTRING=yes --build-arg WITH_CLI_SAPI=no \
  --build-arg WITH_OPENSSL=no --build-arg WITH_NODEFS=no \
  --build-arg WITH_CURL=no --build-arg WITH_SQLITE=no \
  --build-arg WITH_MYSQL=no --build-arg WITH_WS_NETWORKING_PROXY=no \
  --build-arg EMSCRIPTEN_ENVIRONMENT=web
```

For a real run, remove `--dry-run`, use a fresh output directory, and provide the immutable repository and PHP source revisions from the measurement input manifest. For `php-version`, also provide a distinct `--warmup-php-version` and its `--warmup-php-source-sha`; the harness emits one prime immediately before every measured sample. For `link-input-change`, provide a unique `--link-input-variant-id` and `--warmup-repo-revision` whose linked-input tree is the unchanged parent. Use `--samples 1` per variant and run three immutable variants on both sides. Dry-run output lists the complete ordered schedule and feature signature; contract tests assert the prime/target pairing and unique IDs.

## Reviewing evidence

Check that `summary.status` is `succeeded`, all expected prime and measured records exist, and every record links to its matching raw log and metadata file. Verify paired runs have identical feature signatures; raw logs show the exact PHP source SHA, Emsdk manager SHA, resolved SDK release, and zero exit status. Inspect Buildx provenance materials for the pinned base-image digest. Failed records stay in the result set and suppress the median; a failed prime prevents its paired measurement and remains in the results.

`duration_seconds` is the wall-clock time of `docker buildx build`. `cache_hits` counts BuildKit steps logged as `CACHED`; `completed_steps` counts those logged as `DONE`. The event list records each step number and text. Use stage labels and raw logs to identify rebuilds; step counts alone are not a complete rebuilt-stage list.

The lightweight contract tests and dry runs verify harness behavior, not optimization. Actual baseline/candidate Docker builds and their retained evidence are required for AC2.
