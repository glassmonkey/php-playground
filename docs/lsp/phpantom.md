# PHPantom versioned WASI runtime

The PHPantom runtime is built from the upstream PHPantom source archive at a
pinned commit. The build applies a reviewed, checksum-pinned patch that sets
the selected PHP target before analysis and filters core builtin availability
and native parameters. User-defined symbols and PHPDoc parameters are covered
by the focused regression probe. User-code parsing and syntax diagnostics are
not version-aware, and full inventories for every PHP extension are outside
scope.

## Reproducible candidate build

The source pin is PHPantom `49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668`, with
archive SHA-256
`f5861b581a5503c7bf033df82390d08fbc9a971fa769afa90a310d0c623eb59d` and
Cargo.lock SHA-256
`0a601fc471628943f15c4e3f97649b99417b1037cf4f824bd835e8a3a12fad1d`. The
build applies patch SHA-256
`4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d` and
checks all 15 changed source files against the adjacent file manifest before
compilation.

The full JetBrains stubs pin is
`2049ca3cfa1feabf52db074108fe776a5713cf02`, archive SHA-256
`3ef62542d2f77ad30c7dab7dfa726e57e86dd5e3403780294119cf4f5ca6dcb7`. The
builder verifies the complete embedded tree and records its map hash, file
count, and target in candidate provenance.

Docker uses Rust 1.99.0 from the immutable image
`rust:1.99.0-bookworm@sha256:114c7a4425406451c2866b6aafe69fe29b1b298832db1277d411ac73c82d04d6`.
Each run downloads and hashes the upstream archive, applies the patch, checks
the exact stub pin, then emits a WASI candidate and provenance under
`build/phpantom-versioned-candidates/`. It never replaces the checked-in
runtime asset.

Build a candidate for a supported PHP target (5.6, 7.0–7.4, or 8.0–8.5):

```sh
make test-phpantom-runtime-native
make build-phpantom-runtime PHPANTOM_TARGET_VERSION=8.0
```

The native probe records `nativeRawExit`, `nativePassed`, `nativeFailed`,
`knownLimitMatched`, and `unexpectedFailures` in `native-test.json`; the raw
behavior result is also retained in `native-probe-result.json`. It accepts a
clean 7/7 run or the recorded baseline failure: assertion `PHP 7.4 same-name
user documentation marker (known baseline)` in test
`php74_same_name_user_function_and_local_symbols_survive`, with raw exit 101,
6 passed, 1 failed, and zero unexpected failures. Any other native outcome
fails the command. Version guards must pass 2/2 and the pinned `@since` scanner
tests 1/1. WASI candidate builds run the required request harness and fail on
any required assertion.

CI builds the 7.4, 8.0, 8.3, and 8.5 boundaries in sequence on one runner
after the native probe, reusing the verified local Cargo cache safely. The accepted all-12-target matrix and per-artifact hashes are retained
in the manager's review evidence. The focused CI does not claim browser or
Monaco verification, parser-version parity, or production asset readiness.
