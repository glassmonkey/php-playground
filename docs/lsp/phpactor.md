# Phpactor Web Worker adapter

This lane is a CLI-verifiable prototype. The shared editor does not load it yet, so it is not a UI preview.

## Reproduce

Requirements: Node 24.12.0, PHP with Phar enabled, Docker, `curl`, and `shasum`.

From the repository root:

```sh
scripts/lsp/phpactor/build-assets.sh
node --experimental-strip-types scripts/lsp/phpactor/verify-wasm.mjs
node --experimental-strip-types scripts/lsp/phpactor/verify-vite.mjs
```

The asset builder downloads the pinned Phpactor PHAR, verifies its SHA-256, extracts the PHAR, creates Phpactor's WorseReflection PhpStorm-stub map on the host, rewrites those cache paths for the Emscripten filesystem, then packages the extracted application and cache into `assets/lsp/phpactor/phpactor.data`. It uses the existing `src/wasm/Dockerfile` Emscripten 4.0.22 target to run `file_packager.py`; it does not modify that Dockerfile or the existing PHP-WASM assets. If the `phpactor-emscripten:4.0.22` image is absent, Docker builds it with `src/wasm` as its context.

The package PHAR is Phpactor `2026.10.07.0`, MIT, from <https://github.com/phpactor/phpactor/releases/download/2026.10.07.0/phpactor.phar>, SHA-256 `b28bf6166e016d539fc2f2aec18ef918b12590e436a6f1ccbdf30b5bbdbdb16b`. The extracted package includes its license. The PHAR itself and extracted vendor tree are build inputs and are not checked in.

Current packaged asset measurements:

| Asset                                    |  Raw bytes | gzip bytes | SHA-256                                                            |
| ---------------------------------------- | ---------: | ---------: | ------------------------------------------------------------------ |
| `assets/lsp/phpactor/phpactor.data`      | 21,851,151 |  3,257,877 | `2834909a34fa62d0fa98e88df6fbac6ace489ae445ac05bfa91781dc05ebc075` |
| `assets/lsp/phpactor/phpactor-loader.js` |    586,971 |     73,201 | `d3d58a40f11748e46eff97ce2ae12e300147f42cf702944478dca4ac54705060` |

The existing PHP 8.5 WASM binary is 6.7 MiB and is shared with the existing PHP-WASM package; it is not duplicated in this lane. The new raw data package is below GitHub's 100 MB per-file limit.

## Vite worker and public asset check

The application sets `publicDir: 'assets'`, so these files are served from site-root URLs: `/php-8.5.wasm`, `/lsp/phpactor/phpactor.data`, and `/lsp/phpactor/phpactor-loader.js`. The worker follows the existing PHP worker's root WASM convention and uses those root paths. The generated Emscripten data loader is imported at runtime from the public JS URL; it is not statically imported into the worker bundle.

`verify-vite.mjs` creates a temporary app entry that imports `createWorker()`, builds it with the repository Vite configuration, and serves the built output with Vite preview on the worktree's `PORT` (9303 in this worktree). It checks the emitted worker references the root data/loader URLs, checks that public assets were copied, then GETs each asset and compares the response size and Content-Type:

| URL                                | HTTP | Content-Type       |      Bytes |
| ---------------------------------- | ---: | ------------------ | ---------: |
| `/php-8.5.wasm`                    |  200 | `application/wasm` |  7,039,920 |
| `/lsp/phpactor/phpactor.data`      |  200 | not set            | 21,851,151 |
| `/lsp/phpactor/phpactor-loader.js` |  200 | `text/javascript`  |    586,971 |

The data response has no Content-Type under Vite preview, but it returns the exact packaged bytes; Phpactor's Emscripten file loader reads the response as a byte stream and does not branch on Content-Type. The emitted worker was 85,798 bytes. Before switching the public loader to a runtime import, a real Vite worker build bundled the 586,971-byte loader into the worker and warned that Node's `module` import was externalized for browser compatibility; the current build keeps the loader separate and removes that warning. This validates Vite bundling and static asset delivery, not browser execution or editor integration.

## Runtime and request path

`src/lsp/phpactor/index.ts` exports `createWorker()`. The worker uses the existing PHP 8.5 WASM runtime to execute Phpactor PHP code in-process. The Phpactor application is booted per request and calls its internal `CompletionRpc\Handler\CompleteHandler`, `CompletionExtension::SERVICE_SIGNATURE_HELPER`, or `class_mover.handler.hover` service. These are real Phpactor implementations pinned to the PHAR version, not a substitute completer. The internal APIs are version-coupled and are not presented as stable public APIs.

The fixed Phpactor execution runtime is PHP 8.5. The requested analysis version is a separate `php.version` setting supplied through `initialize.initializationOptions.phpVersion`; this worker accepts values present in the existing PHP-WASM version list (`5.6` through `8.5`) and defaults to `8.2`. For the narrowed version-linked verification range `8.4`/`8.5`, this harness exercises analysis version `8.5`; version `8.4` is unverified. Other listed analysis versions are also unverified. The selection is passed to Phpactor configuration. Phpactor itself requires PHP 8.2 or newer to execute.

Implemented JSON-RPC methods: `initialize`, `initialized`, `shutdown`, `exit`, `textDocument/didOpen`, `textDocument/didChange` (full sync), `textDocument/didClose`, `textDocument/completion`, `completionItem/resolve`, `textDocument/signatureHelp`, and `textDocument/hover`. Unknown request methods return JSON-RPC `-32601`; malformed requests and execution failures return `-32600`/`-32603`. Notifications have no response. Open documents are written into the virtual workspace and document versions older than the current version are ignored. Request execution is serialized through a worker queue; each request captures the document text when it reaches the queue. Positions are converted from LSP UTF-16 code units to Phpactor byte offsets.

Completion items include their documentation up front (`resolveProvider: false`); `completionItem/resolve` returns the supplied item unchanged. The worker advertises full-document sync and trigger characters `$`, `>`, `:`, `(`, and `,` as appropriate. Workspace-wide indexing and cross-file resolution have not been verified. The normal persistent Phpactor stdin/stdout LSP server is not used: this PHP-WASM build's `php.run` is synchronous, so each JSON-RPC request invokes the internal handler in a separate PHP run. PHP-WASM does not provide the full POSIX/process runtime expected by Phpactor's ordinary CLI server.

## Verified requests and limits

Run `verify-wasm.mjs` on Node 24.12.0 after building the assets. It runs actual Phpactor handlers through PHP 8.5 WASM and reports WASM/data initialization time and per-request time. On the recorded run, with analysis version `8.5`, the cached PhpStorm map was present and the results were:

| Request                             | Fixture/result                                                                  |                                   Time |
| ----------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------: |
| completion, first request           | `<?php $hello = 'world'; $hel` returned `$hello` with inferred detail `"world"` |                               1,028 ms |
| completion, subsequent request      | same fixture and result                                                         |                               1,544 ms |
| built-in function completion        | `<?php strl` included `strlen` and its inferred signature                       |                                 544 ms |
| same-file function completion       | declaration followed by `gre` included `greetUser`                              |                                 614 ms |
| same-file class completion          | `new Gre` with a local `Greeter` class returned no items                        |                435 ms; not established |
| inferred instance member completion | local `Greeter` variable plus `->greet` returned `greetUser(): void`            |                                 770 ms |
| inferred static member completion   | `Greeter::cre` returned `create(): self(Greeter)`                               |                                 260 ms |
| signature help                      | `<?php strlen(` returned `strlen(string $string): int<0, max>`                  |                                 246 ms |
| hover                               | local `greet` function use returned `greet(string $name): string`               |                                 254 ms |
| signature help, local function      | `function greet(...); greet('a', ` returned `null`                              | 322 ms; unsupported by Phpactor helper |

The measured WASM plus Phpactor data initialization was 496 ms in that run. The harness confirmed the packaged autoloader, license, and stub map were readable in WASM; `posix`, `proc_open`, and the `phar://` stream wrapper were unavailable. Phpactor's internal handlers nevertheless ran without those CLI facilities.

The WASM and packaged-data initialization duration is printed by the harness separately and is not included in per-request timing. These are single CLI/WASM harness observations on the current host, not browser performance measurements. No browser UI verification has been done. Completion for built-in classes, useful same-file class-name completion, multiple analysis PHP versions, and large-project indexing remain unverified.

The local-function signature limitation is not specific to WASM: the same fixture, cursor at EOF, `php.version=8.5`, Phpactor `2026.10.07.0`, and host PHP 8.5.11's internal signature helper raised `Phpactor\Completion\Core\Exception\CouldNotHelpWithSignature` (`Could not provide signature with chain helper`). The adapter maps that helper failure to the JSON-RPC `null` result. The matching `strlen(` fixture returned the same signature shape on host PHP and PHP-WASM.

## Known build issue and correction

The first asset-builder attempt used the repository root as the Docker build context. The existing Dockerfile's `COPY build-assets/replace.sh` therefore failed with `"/build-assets/replace.sh": not found`. The script now supplies `src/wasm` as the context. The corrected build completed with Emscripten 4.0.22 and packaged both Phpactor source and the generated stub cache. The reusable command above reflects the corrected context.
