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

## WASM source, asset, and provenance

PHPantom is maintained in this repository as the Cargo source tree
`rust/vendor/phpantom_lsp`, with a small public wrapper at
`rust/phpantom-runtime-wrapper`. The vendored source is based on upstream
`49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668`; it contains local runtime changes
documented in `rust/vendor/README.md`. The source snapshot reference
`506d253c5ee27bfc3c51fb2541d3e8d819bb4622` identifies the reviewed input, not
an external build dependency. PHPantom's `stubs.lock` pins phpstorm-stubs at
`2049ca3cfa1feabf52db074108fe776a5713cf02` with archive SHA-256
`3ef62542d2f77ad30c7dab7dfa726e57e86dd5e3403780294119cf4f5ca6dcb7`.

The root Cargo workspace pins Rust `1.99.0`, target `wasm32-wasip1`, and
locked dependencies. `make build-phpantom-runtime` builds the local workspace
through the pinned Docker image
`rust:1.99.0-bookworm@sha256:114c7a4425406451c2866b6aafe69fe29b1b298832db1277d411ac73c82d04d6`.
The Dockerfile-specific ignore file sends only the Cargo manifests, toolchain,
Rust sources, and container entry point. It excludes `target`, `node_modules`,
assets, and build output. The Cargo source uses its checked-in `stubs.lock` to
download and verify the fixed stubs archive. The build does not fetch PHPantom
source from another repository or apply a source patch.

`make test-phpantom-runtime-native` runs the wrapper's public `public_lsp`
integration suite in the same Docker build environment. The artifact target
builds the same wrapper for WASI. Both use `--locked`. The candidate, source
fingerprint, Cargo and stubs lock hashes, toolchain, Docker identity, and WASM
hash are written under `build/phpantom-docker-candidates/`. A failed build or
smoke test leaves the checked-in asset unchanged.

The committed asset is
`assets/lsp/phpantom/phpantom_lsp.wasm` (18,700,209 bytes,
SHA-256 `605854cd7d868c2432223c73d18002b2e39e86ea2c26e00655181a2345db6c4e`).
Its Worker URL includes that hash to avoid reusing stale cached bytes. The
asset and `assets/lsp/phpantom/phpantom_lsp.provenance.json` were updated
together from the local workspace candidate after native tests, WASI build,
and all-version smoke passed. A clean application checkout can run `npm ci`
and the Vite/Pages build without Docker or Rust.

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
| Docker native public LSP suite | Passed, 3/3 | `make test-phpantom-runtime-native`; suite time 1.54s, command time 398s. Log and summary are under `build/phpantom-docker-candidates/20261028T060431Z.Z2JgwI/`. |
| Docker WASI build | Passed | `make build-phpantom-runtime`; Rust 1.99.0, target `wasm32-wasip1`, Linux/arm64 Docker builder. Local source fingerprint `2033ded4f19ae88f16f2c27537f47bd79905eefb68fec95f60a9acba24108f36`; Cargo.lock SHA-256 `88b54771ff92cb6d8ce2c0ffef65ffff45f9686f3a75b97f709d56d74b910154`. Log and provenance are under `build/phpantom-docker-candidates/20261028T061139Z.h5SpDn/`. |
| WASI initialization | Passed, 12/12 | `node rust/phpantom-runtime-wrapper/tests/wasm_versions.mjs <candidate>` initialized each supported PHP version in a fresh session. |
| App reactor smoke | Passed | `PHPANTOM_WASM_PATH=<candidate> node scripts/lsp/phpantom/smoke-test.mjs`; ABI exports, completion, resolve, hover, signature help, errors and notifications passed. |
| Candidate / committed asset identity | Passed | 18,700,209 bytes; SHA-256 `605854cd7d868c2432223c73d18002b2e39e86ea2c26e00655181a2345db6c4e`. The same candidate hash is in the Worker URL and provenance. |
| Clean app install | Passed | `npm ci`; 751 packages installed from the root lockfile. |
| Lint and types | Passed | `npm run lint:js` and `npm run build:types`. |
| Client URL tests | Passed, 2/2 | `npm exec vitest run src/lsp/__test__/client.spec.ts`. |
| Vite production build | Passed | `npm run build`; existing large-chunk warning remains. |
| Browser Worker and integrated UI | Not verified in this lane | Requires integrated UI verification after runtime review and the #434 sync gate. |
