# Phpactor Web Worker adapter

This lane is a CLI-verifiable prototype. The shared editor does not load it yet, so it is not a UI preview.

## Reproduce

Requirements: Node 24.12.0, PHP with Phar enabled, Docker, `curl`, and `shasum`.

From the repository root:

```sh
scripts/lsp/phpactor/build-assets.sh
node --experimental-strip-types scripts/lsp/phpactor/verify-wasm.mjs
```

The asset builder downloads the pinned Phpactor PHAR, verifies its SHA-256, extracts the PHAR, creates Phpactor's WorseReflection PhpStorm-stub map on the host, rewrites those cache paths for the Emscripten filesystem, then packages the extracted application and cache into `assets/lsp/phpactor/phpactor.data`. It uses the existing `src/wasm/Dockerfile` Emscripten 4.0.22 target to run `file_packager.py`; it does not modify that Dockerfile or the existing PHP-WASM assets. If the `phpactor-emscripten:4.0.22` image is absent, Docker builds it with `src/wasm` as its context.

The package PHAR is Phpactor `2026.10.07.0`, MIT, from <https://github.com/phpactor/phpactor/releases/download/2026.10.07.0/phpactor.phar>, SHA-256 `b28bf6166e016d539fc2f2aec18ef918b12590e436a6f1ccbdf30b5bbdbdb16b`. The extracted package includes its license. The PHAR itself and extracted vendor tree are build inputs and are not checked in.

Current packaged asset measurements:

| Asset                                    |  Raw bytes | gzip bytes | SHA-256                                                            |
| ---------------------------------------- | ---------: | ---------: | ------------------------------------------------------------------ |
| `assets/lsp/phpactor/phpactor.data`      | 21,851,151 |  3,257,877 | `2834909a34fa62d0fa98e88df6fbac6ace489ae445ac05bfa91781dc05ebc075` |
| `assets/lsp/phpactor/phpactor-loader.js` |    586,971 |     73,201 | `d3d58a40f11748e46eff97ce2ae12e300147f42cf702944478dca4ac54705060` |

The existing PHP 8.5 WASM binary is 6.7 MiB and is shared with the existing PHP-WASM package; it is not duplicated in this lane. The new raw data package is below GitHub's 100 MB per-file limit.

## Runtime and request path

`src/lsp/phpactor/index.ts` exports `createWorker()`. The worker uses the existing PHP 8.5 WASM runtime to execute Phpactor PHP code in-process. The Phpactor application is booted per request and calls its internal `CompletionRpc\Handler\CompleteHandler`, `CompletionExtension::SERVICE_SIGNATURE_HELPER`, or `class_mover.handler.hover` service. These are real Phpactor implementations pinned to the PHAR version, not a substitute completer. The internal APIs are version-coupled and are not presented as stable public APIs.

The fixed Phpactor execution runtime is PHP 8.5. The requested analysis version is a separate `php.version` setting supplied through `initialize.initializationOptions.phpVersion`; this worker accepts values present in the existing PHP-WASM version list (`5.6` through `8.5`) and defaults to `8.2`. Only analysis version `8.2` has been exercised in this harness. The selection is passed to Phpactor configuration; parser behavior for the other listed versions remains unverified. Phpactor itself requires PHP 8.2 or newer to execute.

Implemented JSON-RPC methods: `initialize`, `initialized`, `shutdown`, `exit`, `textDocument/didOpen`, `textDocument/didChange` (full sync), `textDocument/didClose`, `textDocument/completion`, `completionItem/resolve`, `textDocument/signatureHelp`, and `textDocument/hover`. Unknown request methods return JSON-RPC `-32601`; malformed requests and execution failures return `-32600`/`-32603`. Notifications have no response. Open documents are written into the virtual workspace and document versions older than the current version are ignored. Request execution is serialized through a worker queue; each request captures the document text when it reaches the queue. Positions are converted from LSP UTF-16 code units to Phpactor byte offsets.

Completion items include their documentation up front (`resolveProvider: false`); `completionItem/resolve` returns the supplied item unchanged. The worker advertises full-document sync and trigger characters `$`, `>`, `:`, `(`, and `,` as appropriate. Workspace-wide indexing and cross-file resolution have not been verified. The normal persistent Phpactor stdin/stdout LSP server is not used: this PHP-WASM build's `php.run` is synchronous, so each JSON-RPC request invokes the internal handler in a separate PHP run. PHP-WASM does not provide the full POSIX/process runtime expected by Phpactor's ordinary CLI server.

## Verified requests and limits

Run `verify-wasm.mjs` on Node 24.12.0 after building the assets. It runs actual Phpactor handlers through PHP 8.5 WASM and reports WASM/data initialization time and per-request time. On the recorded run, with analysis version `8.2`, the cached PhpStorm map was present and the results were:

| Request                             | Fixture/result                                                                  |                                   Time |
| ----------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------: |
| completion, first request           | `<?php $hello = 'world'; $hel` returned `$hello` with inferred detail `"world"` |                               1,246 ms |
| completion, subsequent request      | same fixture and result                                                         |                                 360 ms |
| built-in function completion        | `<?php strl` included `strlen` and its inferred signature                       |                                 309 ms |
| same-file function completion       | declaration followed by `gre` included `greetUser`                              |                                 324 ms |
| same-file class completion          | `new Gre` with a local `Greeter` class returned no items                        |                273 ms; not established |
| inferred instance member completion | local `Greeter` variable plus `->greet` returned `greetUser(): void`            |                                 288 ms |
| inferred static member completion   | `Greeter::cre` returned `create(): self(Greeter)`                               |                                 291 ms |
| signature help                      | `<?php strlen(` returned `strlen(string $string): int<0, max>`                  |                                 161 ms |
| hover                               | local `greet` function use returned `greet(string $name): string`               |                                 172 ms |
| signature help, local function      | `function greet(...); greet('a', ` returned `null`                              | 140 ms; unsupported by Phpactor helper |

The measured WASM plus Phpactor data initialization was 654 ms in that run. The harness confirmed the packaged autoloader, license, and stub map were readable in WASM; `posix`, `proc_open`, and the `phar://` stream wrapper were unavailable. Phpactor's internal handlers nevertheless ran without those CLI facilities.

The WASM and packaged-data initialization duration is printed by the harness separately and is not included in per-request timing. These are single CLI/WASM harness observations on the current host, not browser performance measurements. No browser UI verification has been done. Completion for built-in classes, useful same-file class-name completion, multiple analysis PHP versions, and large-project indexing remain unverified.

The local-function signature limitation is not specific to WASM: the same fixture, cursor at EOF, `php.version=8.2`, Phpactor `2026.10.07.0`, and host PHP 8.5.11's internal signature helper raised `Phpactor\Completion\Core\Exception\CouldNotHelpWithSignature` (`Could not provide signature with chain helper`). The adapter maps that helper failure to the JSON-RPC `null` result. The matching `strlen(` fixture returned the same signature shape on host PHP and PHP-WASM.

## Known build issue and correction

The first asset-builder attempt used the repository root as the Docker build context. The existing Dockerfile's `COPY build-assets/replace.sh` therefore failed with `"/build-assets/replace.sh": not found`. The script now supplies `src/wasm` as the context. The corrected build completed with Emscripten 4.0.22 and packaged both Phpactor source and the generated stub cache. The reusable command above reflects the corrected context.
