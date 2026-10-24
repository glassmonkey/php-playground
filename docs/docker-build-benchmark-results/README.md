# Docker build benchmark results

Record each baseline/candidate scenario with harness-generated `results.json`, raw logs and Buildx metadata. Do not omit failures. `inputs.json` records the actual upstream/toolchain/container references used. Context exports are reproducible from their immutable Git refs; keep local exports for reruns, but do not track expanded source copies, duplicated zlib trees, or context tar files in PRs. The inherited baseline commit is `2eeffdde9ec27d691e28e8961962dddffd4407a1`; the instrumentation-only measurement baseline is `cdbb0fdff6549fbfa5ea67976c2e4de27bafc119`. The current candidate head is `31456594fcc41601132f418afec51c1f8c05e972`.

## PHP 7.4 cold baseline attempts

All attempts use the same pinned PHP source `004cb827501d1ddaf98daacb185a53e0816f78a7`, emsdk manager `d7b4130688bfa348392b921ab04015aa15c4f154` / Emscripten `6.0.13`, Ubuntu base digest, `linux/arm64`, and dedicated builder `gla96-a3c1`. Keep each attempt in its own result directory; failures are evidence and must not be folded into successful measurements.

| Result directory | Repository revision | Result |
| --- | --- | --- |
| `baseline-7.4-cold` | `806bc14f3229a8ddb5fcbe671721641208d417b1` | Failed before Dockerfile load: Buildx could not find relative `Dockerfile` from the invocation cwd. Kept as a failed run. |
| `baseline-7.4-cold-retry1` | `4b79f60c202b47132fbd12f0ed9c397db56fbcb9` | Failed after emsdk installation because pinned emsdk does not implement `emsdk active`. Kept as a failed run. |
| `baseline-7.4-cold-instrumented` | `cdbb0fdff6549fbfa5ea67976c2e4de27bafc119` | Failed during zlib BuildKit layer commit. The log records no writable temp directory and `metadata_v2.db: read-only file system`; no successful build time or median is reported. |

The final attempt verified `emcc 6.0.13 (e13ee988ce3d87a738dd8f3661d02223308c412a)` and reached PHP 7.4 configure/build before the storage failure. At failure time, the dedicated builder had `ReadonlyRootfs=false` and an RW BuildKit state volume, while Rancher VM `/mnt/data`, `/root`, and `/tmp` were mounted `ext4 (rw,relatime,emergency_ro)`. Later GLA97 recovery evidence (SHA256 `8d77f26c30cdaeaa815a213669aa318b05db6aa28a9afd7e2a2ead9721c0039d`) confirmed writable VM mounts, a running dedicated builder and successful unique VM/builder write-read-delete probes. The failure logs remain failures and are not timing results.

## Compiler-only readiness smoke (not a measurement)

On 2026-10-24 at 08:37:35Z, the dedicated builder reused all 12 cached `emscripten` stage steps and successfully compiled and linked a small setjmp/longjmp program with Emscripten 6.0.13 and `-sSUPPORT_LONGJMP=emscripten`. The raw Buildx output and exact inputs/command are in `readiness-smoke-7.4-emscripten-6.0.13/`. This validates the setting and compiler availability only; it does not exercise PHP or count toward any timing sample.

Strict baseline/candidate timing remains paused while the user-authorized MobileSync backup cleanup is in progress. Wait for its terminal notification and a low-load readback before starting measurements. Then use the same pinned inputs in a new result directory. The baseline comparison source remains `cdbb0fdff6549fbfa5ea67976c2e4de27bafc119`; candidate source is `31456594fcc41601132f418afec51c1f8c05e972` (or its reviewed successor). Failed raw logs/results and the compiler smoke remain separate from future successful samples. Expanded context exports remain local and ignored.
