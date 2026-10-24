# Docker build benchmark results

Record each baseline/candidate scenario with the harness-generated `results.json`, context archive, raw logs and Buildx metadata. Do not omit failures. `inputs.json` records the actual upstream/toolchain/container references used. The inherited baseline commit is `2eeffdde9ec27d691e28e8961962dddffd4407a1`; the instrumentation-only measurement baseline commit will be recorded after it is committed. First measured case: PHP 7.4 cold build on dedicated builder `gla96-a3c1`.
