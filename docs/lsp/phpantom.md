# PHPantom Worker adapter

This adapter runs the official PHPantom LSP reactor entirely inside a module
Worker. The Worker sends one JSON-RPC message at a time to the WASI reactor and
posts its matching response back with the original request ID.

## Runtime and assets

- Upstream: [PHPantom-dev/phpantom_lsp](https://github.com/PHPantom-dev/phpantom_lsp)
- Release: `0.11.1`, official `wasm32-wasip1` reactor
- Release asset: `phpantom_lsp-wasm32-wasip1.tar.gz`
- Archive SHA-256: `611d56ee95368d10562fa2bc2e7ea145a6a02f849b2bc2950e201cfbd3c75e2b`
- WASM module SHA-256: `b591013fd512d0f5b815a0074f9646a4742a8af4b90173ff617215356e8444c0`
- License: MIT (PHPantom); the WASI import shim is MIT OR Apache-2.0.
- Release archive: 4,026,855 bytes; extracted module: 17,424,132 bytes. The
  archive is gzip-compressed tar for distribution. The browser fetches the
  extracted WASM module. Local `gzip -9` output for the WASM is 3,998,143
  bytes; deployed HTTP compression was not measured.

The `.wasm` file is intentionally not committed. Fetch the pinned official
release and verify its digest with:

```sh
./scripts/lsp/phpantom/fetch-wasm.sh
```

The script writes `assets/lsp/phpantom/phpantom_lsp.wasm`, which the local
`.gitignore` excludes. To build the official upstream module from source instead,
install Rust target `wasm32-wasip1` and run the upstream documented command:

```sh
rustup target add wasm32-wasip1
./scripts/lsp/phpantom/build-wasm.sh
```

That source build was attempted from PHPantom commit
`49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668` (archive SHA-256
`f5861b581a5503c7bf033df82390d08fbc9a971fa769afa90a310d0c623eb59d`). It did
not compile on the installed Rust 1.92 toolchain: pinned Mago 1.58.2
dependencies require Rust 1.99. The official release artifact was used for
runtime checks instead.

## Adapter boundary

`src/lsp/phpantom/index.ts` exports `createWorker()`. The message contract is a
single JSON-RPC 2.0 object per `postMessage`; it does not wrap LSP messages in an
application-specific envelope.

The adapter uses the upstream `lsp_alloc`, `lsp_handle`, `lsp_response_len`, and
`lsp_dealloc` exports. It copies output bytes before another WASM call and frees
both request and response allocations. The WASI reactor is instantiated once
per Worker. Message processing is serialized, request IDs are passed through,
notifications produce no response, and upstream JSON-RPC errors are preserved.
Older or duplicate `didChange` notifications are ignored by document version.

PHPantom 0.11.1's upstream WASI dispatcher routes:

- `initialize`, `initialized`, `shutdown`, `exit`
- `textDocument/didOpen`, `didChange`, `didClose` (full document sync)
- `textDocument/completion`, `completionItem/resolve`
- `textDocument/hover`, `textDocument/signatureHelp`
- `textDocument/definition`, `textDocument/documentHighlight`, `textDocument/rename`
- unknown requests as `-32601`; unknown notifications are ignored

The WASI path is per open file. It does not index unopened workspace files,
provide workspace-wide diagnostics, or route diagnostic notifications. It uses
the official upstream `@bjorn3/browser_wasi_shim` API to satisfy WASI Preview 1
imports; this is less fragile than maintaining a custom partial WASI syscall
implementation.

### PHP version

`initialize.initializationOptions.phpVersion` accepts a string in the shared
request format, but PHPantom 0.11.1's WASI dispatcher does not read that option
or expose a version-setting operation. Its headless backend uses the server's
PHP 8.5 default. The adapter therefore accepts an explicit `"8.5"` and returns
JSON-RPC `-32602` for other explicit versions with the reason in the message;
it does not imply that PHP 5.6–8.4 were applied. An omitted option leaves the
server default in place. PHP-version comparison across 5.6–8.5 remains
unverified and requires upstream support for setting the headless backend's
version (or a future WASI release that handles the option).

## Reproduce the CLI harness

Install the harness-only pinned dependency, fetch the official module, and run
the real WASI reactor under Node with the same browser shim used by the Worker:

```sh
npm ci --prefix scripts/lsp/phpantom
./scripts/lsp/phpantom/fetch-wasm.sh
node scripts/lsp/phpantom/smoke-test.mjs
```

The isolated manifest pins `@bjorn3/browser_wasi_shim` `0.4.2` and its lockfile
records the npm integrity hash. The production adapter imports this package as
an application dependency; the integration owner must add the same pinned
dependency to the shared root `package.json` and lockfile. Those shared files
are outside this adapter's edit lane.

The CLI harness checks actual upstream WASM exports, initialize and advertised
capabilities, same-file variable/member completion, same-file static completion,
built-in `date_create()` return-type completion, hover, signature help, completion
resolve, request IDs, PHP-version policy, stale document versions, unknown-method
errors, and notification silence. A local Node 24.12 run measured module
read/compile/instantiate at 238 ms, initialize response at 286 ms, first
completion after `didOpen` at 773 ms, and repeated completion at 10 ms. These are
single-run Node/WASI observations, not browser timings or stable benchmarks.
The adapter Worker bundle was 39,986 bytes (7,402 bytes with gzip -9).

## Verification record

| Entry point                                                                                   | Result              | Evidence and limits                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Upstream `scripts/wasm-smoke-test.mjs` against release 0.11.1                                 | Passed              | Actual reactor returned completion, hover, definition, document highlight, signature help, request errors, and no notification response.                                             |
| `node scripts/lsp/phpantom/smoke-test.mjs`                                                    | Passed              | Actual release WASM under `@bjorn3/browser_wasi_shim` 0.4.2; 17,424,132 byte module. This checks the CLI/WASI dispatcher and shared PHP-version policy helper, not a browser Worker. |
| `npm run build:types:general`                                                                 | Passed              | TypeScript project check, with the isolated shim package temporarily linked into local `node_modules`; no shared dependency files changed.                                           |
| `npm run build`                                                                               | Passed              | Vite production build copied the WASM to `public/lsp/phpantom/phpantom_lsp.wasm`. The application does not yet import or launch this adapter.                                        |
| `esbuild src/lsp/phpantom/worker.ts --bundle --format=esm --platform=browser --target=es2020` | Passed              | Worker and browser WASI shim bundled to 39,986 bytes (7,402 gzip -9).                                                                                                                |
| PHP version option                                                                            | Limited             | Explicit 8.5 is accepted; other values are rejected because the official WASI dispatcher has no version setter. PHP 5.6–8.4 behavior is not measured.                                |
| Browser Worker/UI                                                                             | Not verified        | Browser module instantiation and UI behavior are reserved for user verification.                                                                                                     |
| Rust source rebuild                                                                           | Not verified        | Attempted, but blocked by installed Rust 1.92 versus upstream Mago dependency MSRV 1.99. The official release WASM was used.                                                         |
| Shared application dependency                                                                 | Pending integration | Add `@bjorn3/browser_wasi_shim` `0.4.2` to the root `package.json` and lockfile. The isolated manifest exists for lane-scoped reproduction.                                          |
