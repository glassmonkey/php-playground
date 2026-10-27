# PHPantom Worker adapter

This adapter runs the official PHPantom LSP reactor entirely inside a module
Worker. The Worker sends one JSON-RPC message at a time to the WASI reactor and
posts its matching response back with the original request ID.

## Runtime and assets

- Upstream: [PHPantom-dev/phpantom_lsp](https://github.com/PHPantom-dev/phpantom_lsp)
- Source release: `0.11.1` at `49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668`
- Source archive SHA-256: `f5861b581a5503c7bf033df82390d08fbc9a971fa769afa90a310d0c623eb59d`
- PHP stubs: JetBrains/phpstorm-stubs at `2049ca3cfa1feabf52db074108fe776a5713cf02`
- Stub archive SHA-256: `3ef62542d2f77ad30c7dab7dfa726e57e86dd5e3403780294119cf4f5ca6dcb7`
- Rust toolchain: `1.99.0`, target `wasm32-wasip1`
- Local source patch: `scripts/lsp/phpantom/patches/0001-php-version-initialize.patch`
- License: MIT (PHPantom); the WASI import shim is MIT OR Apache-2.0.

The `.wasm` file is intentionally not committed. The browser adapter checks a
build marker in the `initialize` response, so the unpatched release from
`fetch-wasm.sh` is not suitable for the PHP 7.4/8.5 preview. Rebuild the pinned
source and patch after checkout:

```sh
rustup toolchain install 1.99.0 --target wasm32-wasip1
CARGO="$HOME/.rustup/toolchains/1.99.0-aarch64-apple-darwin/bin/cargo" \
RUSTC="$HOME/.rustup/toolchains/1.99.0-aarch64-apple-darwin/bin/rustc" \
  ./scripts/lsp/phpantom/build-wasm.sh
```

The build script verifies the pinned archives, applies the patch, and writes
`assets/lsp/phpantom/phpantom_lsp.wasm`, which `.gitignore` excludes. Mago 1.58.2
requires Rust 1.99; `CARGO` and `RUSTC` may point directly to toolchain binaries
when a local rustup proxy cannot launch them.

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

The local patch applies `initialize.initializationOptions.phpVersion` to the
PHPantom headless backend and includes the selected engine version in
`serverInfo.version` (for example,
`0.11.1+php-version-setting.1:php7.4`). Only `7.4` and `8.5` are accepted by
the preview. The patch also suppresses named-argument completion below PHP 8.0;
the WASI harness verifies that `strrchr(` offers named parameters under PHP 8.5
and no named-argument completion under PHP 7.4.

This does not make PHPantom's parser grammar for user code version-aware. PHP
7.4 selection does not guarantee later syntax is rejected or diagnosed. The
8.3-only `strrchr` parameter metadata also remains present in the engine's raw
signature path; built-in signature availability needs further upstream or
narrowly scoped parser work. The preview does not provide syntax diagnostics,
and the full PHP language-version matrix is not verified.

## Reproduce the CLI harness

Install the harness dependency, build the patched WASM, and run the real WASI
reactor under Node with the same browser shim used by the Worker:

```sh
npm ci --prefix scripts/lsp/phpantom
CARGO="$HOME/.rustup/toolchains/1.99.0-aarch64-apple-darwin/bin/cargo" \
RUSTC="$HOME/.rustup/toolchains/1.99.0-aarch64-apple-darwin/bin/rustc" \
  ./scripts/lsp/phpantom/build-wasm.sh
node scripts/lsp/phpantom/smoke-test.mjs
```

The root application manifest pins `@bjorn3/browser_wasi_shim` `0.4.2`.

The CLI harness checks actual upstream WASM exports, initialize and advertised
capabilities, same-file variable/member completion, same-file static completion,
built-in `date_create()` return-type completion, hover, signature help, completion
resolve, request IDs, PHP-version policy, stale document versions, unknown-method
errors, and notification silence. The latest local Node 24.12 run measured module
read/compile/instantiate at 21.93 ms, initialize response at 20.35 ms, first
completion after `didOpen` at 24.94 ms, and repeated completion at 0.32 ms. These
are single-run Node/WASI observations, not browser timings or stable benchmarks.

## Verification record

| Entry point | Result | Evidence and limits |
| --- | --- | --- |
| `node scripts/lsp/phpantom/smoke-test.mjs` | Passed | Patched 18,501,823 byte WASM under `@bjorn3/browser_wasi_shim` 0.4.2. Actual initialize responses report `php8.5` and `php7.4`; the harness checks named-argument completion differs between them. This is Node/WASI, not a browser Worker. |
| `wasm-tools validate assets/lsp/phpantom/phpantom_lsp.wasm` | Passed | Validates the built module format. |
| `npm run build:types:general` | Passed | TypeScript project check against the current Worker change. |
| PHP version coverage | Limited | User-code parser syntax and diagnostics are not version-targeted; the `strrchr` 8.3-only parameter remains exposed by raw signature metadata. |
| Browser Worker/UI | Not verified | Browser module instantiation and UI behavior are reserved for user verification. |
| Rust source rebuild | Passed | Pinned source/stubs build completed with Rust 1.99; `rust-objcopy` emitted a non-fatal missing `libLLVM.dylib` warning while stripping debug info. |
