# Versioned PHPantom WASM preview

The current preview selector contains four PHPantom WASM artifacts: PHP 7.4,
8.0, 8.3, and 8.5. Each artifact is selected by the PHP version in the
playground URL and verified against its SHA-256 and byte count before compiling.
The PHPantom build identity is shared by these four builds, so it is not used to
infer a PHP target; the worker's selected version and artifact hash provide that
binding.

The preview expects local candidate files at
`assets/lsp/phpantom/versioned-preview/<version>/phpantom_lsp.wasm`. Vite serves
`assets/` as its public source directory. These files are local-only and are not
part of this change. The candidate files used for local verification came from
Phase B manifests under
`/private/tmp/gla115-versioned-embedded-wasm-trial/artifacts/phase-b/`.

| PHP | WASM SHA-256                                                       |      Bytes |
| --- | ------------------------------------------------------------------ | ---------: |
| 7.4 | `176d7c61743098b0e4ba6ce74751716e7154e1d9c9885b3788096a426e159bf3` | 18,504,747 |
| 8.0 | `7c874fef41f7082b20f437469945904c3d2d542861cce36dffccef0b8751430a` | 18,504,747 |
| 8.3 | `7dc6dc0d0520e93ce343a90a1067cd9e3fc9c0c4ea7da114719ec0c401a36c90` | 18,504,747 |
| 8.5 | `e3ce4b1977686f1f0ac8f401b46d248f63a663a54340d40e557cb6568f28560d` | 18,504,747 |

All four manifests identify PHPantom source commit
`49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668`, reviewed source patch SHA-256
`e12de7944592edf7f38fc8fcf4a5a6065468600329641bd24bb8ae48d4fd260d`, and
phpstorm-stubs commit `2049ca3cfa1feabf52db074108fe776a5713cf02` with archive
SHA-256 `3ef62542d2f77ad30c7dab7dfa726e57e86dd5e3403780294119cf4f5ca6dcb7`.
The patch contains behavior changes; the manifests' empty `patchIds` indicates
there is no separate behavior patch bundle, not that the source is unmodified.

Each PHP-version change creates a new module worker and PHPantom/WASI instance,
so open-document state is not reused across targets. The main page caches only
immutable compiled modules under `(PHP version, artifact SHA-256)`. Turning
autocomplete off does not create a worker or fetch a PHPantom artifact.

Only these four targets have candidate artifacts in this preview. The other
eight PHP versions remain unsupported by PHPantom here and are not covered by
this preview. This does not claim application-wide or production support. The
bounded Phase B experiment retained an unresolved same-name user-function
documentation assertion: the user function's FQN and completion insertion are
preserved, but resolve does not return its PHPDoc. This remains a known
limitation.
