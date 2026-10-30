# PHPantom versioned WASI builds

PHPantom's WASI artifact can be built for an explicit PHP target. The target
selects embedded builtin availability and version-specific native parameters
before the server indexes requests. It does not change PHPantom's parser or
make syntax diagnostics version-aware.

## Reproducible candidate builds

The build starts from PHPantom `PHPantom-dev/phpantom_lsp` commit
`49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668` and verifies the upstream source
archive SHA-256
`f5861b581a5503c7bf033df82390d08fbc9a971fa769afa90a310d0c623eb59d` and
Cargo.lock SHA-256
`0a601fc471628943f15c4e3f97649b99417b1037cf4f824bd835e8a3a12fad1d`. It
applies the reviewed version-target patch
`4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d`.
After applying it, the builder hashes all 15 changed and added Rust files and
compares them with `patches/phase-b-versioned-target.files.json` (SHA-256
`b15beb40bcac3d50ab75f722c874aba5cb93dcab55aa41aef1e54108c6d35598`).
The builder also requires the unique Cargo `OUT_DIR` `.commit` marker to equal
the full 40-character stubs lock commit, and records the marker, complete
archive SHA-256, `PhpStormStubsMap.php` SHA-256, and embedded stub-file count.
The patch includes the build-time target selection, core-stub availability
scanner, focused regression tests, and protection for user PHPDoc parameters.
The full stubs archive is fetched and verified through the pinned upstream
`stubs.lock`: JetBrains phpstorm-stubs commit
`2049ca3cfa1feabf52db074108fe776a5713cf02`, archive SHA-256
`3ef62542d2f77ad30c7dab7dfa726e57e86dd5e3403780294119cf4f5ca6dcb7`.

Docker uses Rust `1.99.0` from
`rust:1.99.0-bookworm@sha256:114c7a4425406451c2866b6aafe69fe29b1b298832db1277d411ac73c82d04d6`.
The Docker context contains only `scripts/lsp/phpantom/`; generated output and
the application asset are outside the image. Candidate artifacts, SHA-256
sidecars, build provenance, and numeric Docker exits are retained under
`build/phpantom-docker-candidates/`. Final candidates are stored by PHP target
and WASM SHA-256 under `build/phpantom-versioned-candidates/`. Cargo uses
fixed `/cache` and `/out/target` paths inside the builder. Matrix builds are
serialized, and each build revalidates the complete cached stub tree before
and after Cargo runs. The checked-in WASM asset is never replaced.

Run the native regression probe and build an explicit WASI candidate with:

```sh
scripts/lsp/phpantom/build-wasm.sh native-test
scripts/lsp/phpantom/build-wasm.sh artifact 7.4
```

The artifact target accepts PHP 5.6, 7.0–7.4, and 8.0–8.5. Verify a candidate
against its adjacent provenance file with:

```sh
node scripts/lsp/phpantom/versioned-wasi-test.mjs \
  build/phpantom-versioned-candidates/<php-version>/<wasm-sha256>/provenance.json
```

The WASI probe checks the artifact hash and initialize build identity, then
exercises version-specific cold and warm builtin availability, named-argument
completion, `strrchr` completion/signature/resolve, and user-symbol behavior.
Native tests cover the matching Rust APIs, nearby Core functions without
`@since`, and preservation of user virtual parameters. The same-name
user-function documentation marker is retained as a known baseline failure;
it is reported as `KNOWN_LIMIT`, not counted as a passing assertion.

## Verified scope and limits

The approved matrix covers all 12 PHP targets: 5.6, 7.0–7.4, and 8.0–8.5.
Eight candidates were built in the pinned Docker environment; the four
manager-approved 7.4, 8.0, 8.3, and 8.5 artifacts were reused after provenance
and source-equivalence checks. Each target passed 20 focused WASI assertions.
The native public probe remains 6/7 because of the separate same-name user
documentation-marker baseline; profile guards passed 2/2 and scanner tests
1/1. These checks do not establish full extension inventories, browser or
Monaco integration, or production asset readiness. The target controls tested
builtin availability, native parameter metadata, and the PHP 8.0 named-
argument boundary; it does not make user-code parsing or syntax diagnostics
version-aware. The PHPantom build identity is distinct from the selected PHP
target. Artifact hashes are recorded individually with source and input
provenance.
