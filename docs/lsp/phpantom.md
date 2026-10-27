# PHPantom runtime

The PHPantom LSP adapter runs the WASI reactor in a module Worker. The public
runtime contract is `LspClient.connect({ worker, model, monaco, phpVersion,
onStatus })` and `dispose()`; `createWorker()` creates the module Worker. One
JSON-RPC message is handled at a time, document changes are versioned, stale
changes and late Monaco results are ignored, and disposal unregisters providers
and terminates the Worker.

## PHP versions and stub availability

The Worker passes the selected PHP target to PHPantom during `initialize`.
Supported targets follow `src/php-wasm/php.ts`: 5.6, 7.0–7.4, and 8.0–8.5.
The WASM build reports that target in `serverInfo.version`, which the adapter
checks before marking initialization ready. Named-argument completion is
suppressed below PHP 8.0.

Recognized `PhpStormStubsElementAvailable` parameter attributes are filtered
before PHPDoc merge. Names of native parameters excluded for the selected
version are carried through function and method signature reconstruction, so a
matching `@param` cannot restore them as virtual parameters. Unmatched
user-documented extra parameters remain visible, and surviving native
parameters retain PHPDoc type enrichment. The `strrchr` `before_needle`
parameter is absent at PHP 8.0 and present starting at PHP 8.3.

The pinned core stub paths filter exact PHP `@since X.Y` tags. Extension stub
paths are excluded because their `@since` tags can refer to extension
releases. User documents are not in the embedded stub map and are not filtered
by this rule. The versioned indexes and lazily loaded function cache use the
same availability check, so resolving an older completion does not bring a
newer builtin back into subsequent completion results.

This configures builtin availability and selected parameter metadata; it does
not make PHPantom's user-code parser grammar or syntax diagnostics version
aware. Full inventories for every installed PHP extension are outside scope.

## WASM provenance and asset

- PHPantom: `0.11.1`, upstream commit `49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668`
- PHPantom source archive SHA-256: `f5861b581a5503c7bf033df82390d08fbc9a971fa769afa90a310d0c623eb59d`
- phpstorm-stubs commit `2049ca3cfa1feabf52db074108fe776a5713cf02`
- phpstorm-stubs archive SHA-256: `3ef62542d2f77ad30c7dab7dfa726e57e86dd5e3403780294119cf4f5ca6dcb7`
- Runtime patch: `scripts/lsp/phpantom/patches/0001-php-version-initialize.patch`
- Runtime patch SHA-256: `ea43adab881c9214e9f693d0f11ed3cec93314f23d331210fc86de8c22fe04fc`
- Rust toolchain: `1.99.0`, target `wasm32-wasip1`; Cargo uses `--locked`
- Docker build image: `rust:1.99.0-bookworm@sha256:114c7a4425406451c2866b6aafe69fe29b1b298832db1277d411ac73c82d04d6`
- WASI shim: `@bjorn3/browser_wasi_shim` `0.4.2`, root lockfile pinned
- Asset: `assets/lsp/phpantom/phpantom_lsp.wasm` (18,530,827 bytes)
- Asset SHA-256: `2ba179568c31958b731d3eb70f69b788187fcb605094b39d289c4d4caa3ba3da`
- Build provenance: `assets/lsp/phpantom/phpantom_lsp.provenance.json`
- Worker version and cache URL pin the runtime marker `.3` and the asset hash.

`make build-phpantom-runtime` is the single host entry point. It builds and runs
the pinned Docker builder, which downloads both pinned archives, verifies their
SHA-256 values, applies the checked-in patch, and builds with locked Rust
dependencies. The host does not need Rust. The candidate and `provenance.json`
are exported beneath `build/phpantom-docker-candidates/`; a failed build does
not replace the checked-in asset. The committed WASM lets clean checkout,
`npm ci`, and Vite/Pages builds run without Docker or Rust. Its checksum is
also part of the Worker URL query to avoid reusing a stale cached asset after
an update.

To rebuild the candidate and run the focused native parameter reconstruction
regression separately:

```sh
make build-phpantom-runtime
make test-phpantom-runtime-native
```

The default artifact build does not compile the native test harness. The
explicit native test target uses the same pinned source, stubs, patch, Docker
image, and Cargo lockfile without producing an artifact.

The committed provenance records the builder image ID and platform, Docker
server version, Rust/Cargo versions, pinned commits and archive hashes,
Cargo.lock hash, patch hash, target, and exported artifact hash. The successful
candidate run fetched both upstream archives, verified their SHA-256 values,
used fresh extractions, applied only the checked-in patch, and built with Cargo
`--locked`. No pre-existing dirty source patch was mixed into the artifact.
The Docker native regression rerun from this build was intentionally stopped
during test-binary compilation and is unverified; the accepted
`a34b6782b2a5c9865cd5780826fdb192b1a1c020` source/patch native regression
passed before this Docker replan.

## WASI regression harness

Install the root package dependencies and run the real reactor under Node:

```sh
npm ci
node scripts/lsp/phpantom/smoke-test.mjs
```

The harness checks the actual WASM exports and initialize response for all 12
versions; same-file, member, static, builtin, hover and signature completion;
completion resolve; named-argument behavior below/above PHP 8.0; `strrchr`'s
`before_needle` boundary at PHP 8.3; PHP 7.0 class availability; `intdiv` 7.0
and `array_key_first` 7.3 boundaries; PHP 8.0, 8.4, and 8.5 builtin boundaries;
cold and warm completion before and after resolving sibling builtins;
fresh-engine version changes; user-source `@since` preservation; request IDs;
stale document versions; and JSON-RPC errors/notifications.

## Verification record

| Check | Result | Evidence and limits |
| --- | --- | --- |
| Focused native parameter reconstruction regression | Previously passed; Docker rerun incomplete | The accepted `a34b678` source/patch passed PHP 8.0 absent / 8.3 present for function and method, preserving virtual `@param` and surviving native `non-empty-string` enrichment. The Docker rerun was stopped during native test-binary compilation; its result is unverified. |
| Existing pinned-core availability regression | Passed | 12 `stubs::tests` passed, including exact `@since` and extension-release controls. |
| Full WASI smoke | Passed on Docker candidate | `PHPANTOM_WASM_PATH=<candidate> node scripts/lsp/phpantom/smoke-test.mjs`; all 12 supported versions, cold/warm regression, PHP 8.0/8.3 parameter availability, `intdiv`/`array_key_first`, AssertionError, and PHP 8.4/8.5 cases passed. |
| `npm ci --ignore-scripts --offline` | Passed | Clean install from root lockfile; 751 packages installed, no vulnerabilities. |
| `npm run build` | Passed | Vite production build used the final hash-pinned asset; existing large-chunk warning remains. |
| Docker WASM build | Passed | Actual `make build-phpantom-runtime`; Docker image `rust:1.99.0-bookworm@sha256:114c7a4425406451c2866b6aafe69fe29b1b298832db1277d411ac73c82d04d6`, Linux/arm64 builder. Both upstream archives were downloaded and checksum-verified; Cargo `--locked`. |
| Asset and patch SHA-256 | Recorded above | The smoke and Vite build use the final asset hash. |
| Browser Worker and integrated UI | Not verified in this lane | Requires integrated UI verification. |
