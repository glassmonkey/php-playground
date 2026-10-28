# PHP version profile data generator (candidate only)

`scripts/lsp/php-profiles` is a standalone Cargo package for analyzing the pinned JetBrains PHPStorm stubs and generating version-profile candidates. It has its own `Cargo.lock` and Rust toolchain pin; it is intentionally outside the root Rust workspace. It reads source from an externally verified `phpstorm-stubs` extraction and does not vendor or modify it.

The package currently implements strict normalization for `PhpStormStubsElementAvailable` inclusive bounds and `LanguageLevelTypeAware` version/type maps. Unknown aliases, malformed arguments, contradictory bounds, duplicate versions, and lossy CST extraction return diagnostics instead of choosing a fallback silently.

The current generator parses and verifies the pinned map as an inventory of logical source files; it does not include `PhpStormStubsMap.php` as a runtime profile file. The consumer loads resolved declaration sources directly. It deduplicates identical file contents by SHA-256 and emits the 12 target keys (`5.6`, `7.0`–`7.4`, `8.0`–`8.5`) under schemaVersion 1. Its output is explicitly **partial**: it applies function/method `LanguageLevelTypeAware` return types by CST-selected edits, synchronizes the one attached `@return` type, updates an existing native return hint, and removes the consumed attribute. It also filters function/method parameters using inclusive `PhpStormStubsElementAvailable` bounds, removes the matching `@param` entry when a parameter is excluded, and removes the consumed availability attribute when retained. Identical same-span edits with the same replacement coalesce; conflicting overlaps fail closed with both edit kinds, owners, and spans in the diagnostic. `coverage.json` records per-target changed files/declarations by semantic family plus unresolved availability and ambiguity diagnostics. Parameter `LanguageLevelTypeAware` type/native-hint/PhpDoc coherence, class/member declarations, defaults, and other metadata are not transformed yet. Every profile remains marked unusable as a complete selected-version profile. Do not copy this output into `assets/lsp` or connect it to the worker.

## Local use

Use the manager-verified extracted source matching `rust/vendor/phpantom_lsp/stubs.lock`, then run from this package directory:

```sh
PHPANTOM_STUBS_ROOT=/path/to/verified/phpstorm-stubs \
  cargo test --locked --offline

cargo run --locked --offline --bin inventory > /tmp/php-profile-inventory.json
cargo run --locked --offline --bin generate -- \
  --stubs-root /path/to/verified/phpstorm-stubs \
  --output /tmp/php-profile-candidate
```

The output directory must be new or empty; generation refuses to overwrite a non-empty directory. `manifest.json` contains the resolved source file list for every PHP target. Blob URLs are relative to that manifest and include their SHA-256. `provenance.json` records the pinned upstream commit/archive digest, map hash, and a deterministic mapped-tree fingerprint. Keep the separate inventory output beside `coverage.json` for review.

## Current coverage boundary

Normalization and bounded transformations are tested against actual pinned function, method, parameter, alias, and PhpDoc fixtures plus malformed synthetic metadata. Full-map inventory has found 69 PhpDoc parser diagnostics, class/member declaration families not yet transformed, and extension `@since` tags whose values do not denote PHP language versions. Parameter signature filtering and matching `@param` removal are implemented only when metadata is unambiguous. The current candidate does not yet transform class/member availability or parameter `LanguageLevelTypeAware` type/default/doc coherence.
