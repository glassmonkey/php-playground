# Docker build benchmark results

Record each baseline/candidate scenario with the harness-generated `results.json`, context archive, raw logs and Buildx metadata. Do not omit failures. `inputs.json` records the actual upstream/toolchain/container references used. The inherited baseline commit is `2eeffdde9ec27d691e28e8961962dddffd4407a1`; the instrumentation-only measurement baseline is `cdbb0fdff6549fbfa5ea67976c2e4de27bafc119`. The current optimization candidate is `f4afa4dd3da9f2a0af166ebfc77a49e727bdc41c`.

## PHP 7.4 cold baseline attempts

All attempts use the same pinned PHP source `004cb827501d1ddaf98daacb185a53e0816f78a7`, emsdk manager `d7b4130688bfa348392b921ab04015aa15c4f154` / Emscripten `6.0.13`, Ubuntu base digest, `linux/arm64`, and dedicated builder `gla96-a3c1`. Keep each attempt in its own result directory; failures are evidence and must not be folded into successful measurements.

| Result directory | Repository revision | Result |
| --- | --- | --- |
| `baseline-7.4-cold` | `806bc14f3229a8ddb5fcbe671721641208d417b1` | Failed before Dockerfile load: Buildx could not find relative `Dockerfile` from the invocation cwd. Kept as a failed run. |
| `baseline-7.4-cold-retry1` | `4b79f60c202b47132fbd12f0ed9c397db56fbcb9` | Failed after emsdk installation because pinned emsdk does not implement `emsdk active`. Kept as a failed run. |
| `baseline-7.4-cold-instrumented` | `cdbb0fdff6549fbfa5ea67976c2e4de27bafc119` | Failed during zlib BuildKit layer commit. The log records no writable temp directory and `metadata_v2.db: read-only file system`; no successful build time or median is reported. |

The final attempt verified `emcc 6.0.13 (e13ee988ce3d87a738dd8f3661d02223308c412a)` and reached PHP 7.4 configure/build before the storage failure. Read-only diagnosis found the dedicated builder had `ReadonlyRootfs=false` and an RW BuildKit state volume. Rancher VM `/dev/vda1` had 45.9 GiB available but `/mnt/data`, `/root`, and `/tmp` were mounted with `ext4 (rw,relatime,emergency_ro)`. The host shared volume `/Users/glassmonkey` had only 118 MiB available. No cache pruning, image deletion, or VM restart was performed. Do not rerun Buildx until the VM filesystem state and host space are recovered.

After recovery, resume with the same pinned inputs and a new result directory. The baseline comparison source remains `cdbb0fdff6549fbfa5ea67976c2e4de27bafc119`; candidate source is the current candidate commit. Failed logs and context archives above remain separate from future successful results.
