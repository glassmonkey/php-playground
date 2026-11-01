# PR #437 Web/Worker asset regeneration

Starting PR head: `ba63d9b04c321ebb1cef7e306127479392c03d77`.
The build context includes the uncommitted Dockerfile changes recorded by SHA256
in `build-inputs.json`; the Buildx VCS revision alone does not identify that context.
`source-pins.json` records the previous source audit and its checksum. All twelve
selected source SHAs were reconciled with the assignment before use.

Builds use `gla96-a3c1`, `linux/arm64`, the pinned Ubuntu manifest digest,
Emsdk 6.0.13 and the pinned emsdk repository commit. Only one Buildx job runs at a
time. The Dockerfile's dependency versions, patches, link options and C/JS inputs
are included in the input file hashes. Cached dependencies and apt repositories
are not a claim of byte-for-byte reproducibility on a fresh future Ubuntu mirror.

Each version's build record contains the exact command, source SHA, log checksum,
Buildx metadata, raw output checksums and installed checksums. The installer only
formats the generated JS with the repository's Prettier configuration, validates
the embedded Wasm length/MD5, then installs the pair. Generated JS is never edited
by hand. Build timestamps can change phpinfo's Build Date. The snapshot test normalizes
only Build Date (in addition to its existing request-time normalization). Removed
`--enable-vrzno` configure arguments are retained as explicit snapshot changes.

The inherited 8.5 build predates the correction to the Dockerfile's source-SHA
display. Its source checkout was verified by the build's full-SHA equality check;
the blank display came from a nested relative `git -C php-src` after `cd php-src`.
The correction uses `/root/php-src` and does not change generated code.

## Acceptance checks

- `python3 scripts/audit-wasm-assets.py` checks all pairs, actual Worker detection
  and the lazy-file Worker guard. The older baseline is
  `a36912b0ad210d64a2304cf77dc4f1ce2daff703`, whose loaders selected Worker using
  `RuntimeName === 'WORKER'`. The regenerated loaders detect `WorkerGlobalScope`.
- The same audit parses actual Wasm Import, Export and Code sections. It resolves
  the old callback exports through the base JS mapping to Wasm function indices,
  checks their old bodies are absent from the new Code section, and records their
  exact bytes. It also rejects obsolete callback references in JS and Wasm and
  records every current Wasm import/export. Minified export names can be reused
  for other functions; absence is checked through semantic JS mappings and bodies,
  rather than assuming a minified name must disappear.
- `npx playwright test e2e/wasm-assets.spec.ts --project chromium` starts an actual
  browser module Worker for every supported version. The Worker loads the tracked
  pair, calls `FS.createLazyFile`, then reads its bytes through synchronous XHR and
  compares the complete contents with a fixed text fixture.
- The public worker and application regression suites remain separate checks.

## Existing runtime limitations and scope

Where present, these limitations already exist in the starting PR's generated
loaders. Per-version audit records compare the old and new stub lists. They are
separate from the Web/Worker regression
and the removed VRZNO callbacks:

| Limitation | Reachable path / boundary | Classification |
| --- | --- | --- |
| `Asyncify.handleSleep` without an `Asyncify` definition | `php_pollfd_for` in `php_wasm.c` calls `wasm_poll_socket` in `phpwasm-emscripten-library.js`. Network/socket polling reaches this shim. | Existing socket path defect. Echo/extension/lazy-file success does not establish socket support. No Asyncify repair in this regeneration. |
| `PHP.abortPHP()` calls missing `wasm_sapi_abort_request` | Direct use of this public wrapper calls `ccall` for an unexported function. Repository search found no internal caller. Worker cancellation uses Worker termination. | Existing abort API defect; not introduced by regeneration. |
| `getcontext`, `makecontext`, `swapcontext` abort stubs | Wasm imports resolve to generated missing-function stubs if their C paths execute. | Existing unsupported context-switching paths. Ordinary successful PHP execution does not prove them supported. |
| `getdtablesize`, `initgroups`, `posix_spawnp` abort stubs | Wasm imports resolve to generated missing-function stubs if their descriptor/group/process paths execute. | Existing unsupported system paths. `ERROR_ON_UNDEFINED_SYMBOLS=0` allows these warnings. |
| Other defensive `abort(...)` calls | Loader fetch/compile errors, filesystem invalid arguments, lazy-file HTTP/range failures and deliberate runtime aborts. | Error handling, not evidence of a newly missing imported function. |

The two old `vrzno_*_callback` stubs and exported `exec_callback` / `del_callback`
wrappers are in scope and must disappear in every regenerated pair.

## Generated asset summary

| PHP | Wasm bytes | Defined functions (base → new) | Existing missing-function stubs |
| --- | ---: | ---: | ---: |
| 5.6 | 8,080,492 | 10911 → 10909 | 0 |
| 7.0 | 8,292,363 | 11023 → 11021 | 0 |
| 7.1 | 8,526,060 | 11593 → 11591 | 0 |
| 7.2 | 8,642,856 | 11682 → 11680 | 0 |
| 7.3 | 8,548,541 | 11826 → 11824 | 0 |
| 7.4 | 8,873,811 | 11970 → 11968 | 0 |
| 8.0 | 9,035,400 | 12204 → 12202 | 0 |
| 8.1 | 8,914,969 | 12355 → 12353 | 3 |
| 8.2 | 9,191,731 | 12679 → 12677 | 4 |
| 8.3 | 9,320,345 | 12748 → 12746 | 5 |
| 8.4 | 10,841,005 | 13851 → 13849 | 5 |
| 8.5 | 12,136,151 | 14492 → 14490 | 6 |

## Final local verification

All 539 Vitest tests and all 254 Chromium tests passed, including twelve real
Worker lazy-file reads and twelve Web rejection checks. Lint, types, build,
Dockerfile checks and the complete twelve-version asset audit passed. Buildx
active history was empty after generation. Commands and log checksums are in
`verification-results.json`. The first sandboxed Vitest attempt could not launch
Chromium for OG-image tests; the final run outside that sandbox passed all tests.
Local Node was 24.19.0; the project and GitHub CI use 24.12.0.
