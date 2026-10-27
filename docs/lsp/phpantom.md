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
- WASI shim: `@bjorn3/browser_wasi_shim` `0.4.2`, root lockfile pinned
- Asset: `assets/lsp/phpantom/phpantom_lsp.wasm` (18,532,100 bytes)
- Asset SHA-256: `12b4f522e7419711ef915c7d522d9163ab27cf6d37ddfe0b8e12c6e34d92e6d5`
- Worker version and cache URL pin the runtime marker `.3` and the asset hash.

`build-wasm.sh` downloads both pinned archives, verifies their SHA-256 values,
applies the checked-in patch, and builds with locked Rust dependencies. The
WASM is included in the repository so clean checkout, `npm ci`, and Vite/Pages
build do not require local Rust. Its checksum is also part of the Worker URL
query to avoid reusing a stale cached asset after an update.

Rebuild the asset with Rust 1.99 and the WASI target installed:

```sh
rustup toolchain install 1.99.0 --target wasm32-wasip1
./scripts/lsp/phpantom/build-wasm.sh
shasum -a 256 assets/lsp/phpantom/phpantom_lsp.wasm
```

The build script's GitHub DNS/archive fetch failed in this environment and is
not counted as a successful network retrieval. The local PHPantom source
archive and phpstorm-stubs archive matched the pinned SHA-256 values above.
The source archive identifies commit `49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668`;
the stubs extraction identifies commit
`2049ca3cfa1feabf52db074108fe776a5713cf02`. The build used fresh archive
extractions, applied only the checked-in patch, and ran Cargo with `--locked`.
No pre-existing dirty source patch was mixed into the artifact.

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
| Focused native parameter reconstruction regression | Passed | PHP 8.0 absent / 8.3 present for function and method; virtual `@param` and surviving native `non-empty-string` enrichment retained. 1 test passed. |
| Existing pinned-core availability regression | Passed | 12 `stubs::tests` passed, including exact `@since` and extension-release controls. |
| Full WASI smoke | Passed | `node scripts/lsp/phpantom/smoke-test.mjs`; 12-version cold/warm matrix, PHP 8.0/8.3 `strrchr`, `intdiv`/`array_key_first`, AssertionError, and PHP 8.4/8.5 cases passed. |
| `npm ci --ignore-scripts --offline` | Passed | Clean install from root lockfile; 751 packages installed, no vulnerabilities. |
| `npm run build` | Passed | Vite production build used the final hash-pinned asset; existing large-chunk warning remains. |
| WASM build | Passed | Fresh extractions of verified pinned archives, checked-in patch only, Rust 1.99, Cargo `--locked`; GitHub DNS retrieval failed and is not claimed. |
| Asset and patch SHA-256 | Recorded above | The smoke and Vite build use the final asset hash. |
| Browser Worker and integrated UI | Not verified in this lane | Requires integrated UI verification. |
