# Versioned PHPantom runtime

The playground selects a PHPantom WASM by the PHP version in the URL. The
supported targets are PHP 5.6, 7.0–7.4, and 8.0–8.5. Each version has a
separate file at `assets/lsp/phpantom/php-<version>.wasm`; the Worker requests
`/lsp/phpantom/php-<version>.wasm?sha256=<expected-hash>`. The client checks
both byte count and SHA-256 before compiling. Compiled modules are cached by
version and hash, and every version switch starts a fresh analysis Worker.
Turning autocomplete off creates no PHPantom Worker and fetches no PHPantom
WASM.

The public [`manifest.json`](../../assets/lsp/phpantom/manifest.json) records
the exact artifact hashes, sizes, per-artifact source patch and provenance
hashes, plus the upstream PHPantom and phpstorm-stubs pins. PHPantom is MIT
licensed. JetBrains phpstorm-stubs is Apache-2.0; its repository includes PHP
manual material under CC BY 3.0. See the linked upstream license files in the
manifest.

## Build and verify

The local Rust workspace uses Rust 1.99 and the pinned `phpstorm-stubs` archive.
Its Docker builder copies only the local Cargo source, toolchain, and build
entrypoint. It does not download PHPantom source from a separate repository or
apply a build-time source patch. `make build-phpantom-runtime` creates a
candidate without replacing the build-only asset; `make test-phpantom-runtime-native`
runs the public LSP tests.

To verify the browser build and all 12 selected artifacts:

```sh
npm run test:ci
npm run build:types
npm run lint:js
npm run build
npx vite preview --host 127.0.0.1 --port 4176
```

In another terminal, run `node e2e/versioned-wasm-matrix.mjs`. It reads the
committed manifest by default. `PLAYWRIGHT_BASE_URL` selects another preview
URL, `PHPANTOM_MATRIX_VERSIONS` selects a comma-separated subset, and
`PHPANTOM_MATRIX_OUT` sets the report path. Named-argument behavior is checked
with an explicit completion request; normal builtin completion and insertion
are checked by natural typing.

## Scope and known limitation

The published matrix covers artifact identity, selected completion and
signature boundaries, version switching, browser history, and autocomplete
configuration. It does not claim full PHP grammar or diagnostics parity across
versions. A controlled Phase A/B comparison found that resolving a same-name
user function preserves its identity and insertion but does not return that
function's PHPDoc marker. That remains a known limitation.
