# PHPantom source snapshot

`phpantom_lsp` is maintained here as ordinary Rust source so the playground
can build the browser runtime without a second repository or a build-time
patch step.

## Provenance

- Upstream version: 0.11.1
- Upstream commit: `49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668`
- Upstream source archive SHA-256: `f5861b581a5503c7bf033df82390d08fbc9a971fa769afa90a310d0c623eb59d`
- phpstorm-stubs pin: `2049ca3cfa1feabf52db074108fe776a5713cf02`
- phpstorm-stubs archive SHA-256: `3ef62542d2f77ad30c7dab7dfa726e57e86dd5e3403780294119cf4f5ca6dcb7`
- Preserved implementation snapshot reference: commit `506d253c5ee27bfc3c51fb2541d3e8d819bb4622`, bundle SHA-256 `a0b8bb67313c6967f14508eefacd77b13993ea5b27e37ede066f297aa08ee812`

This source includes local changes on top of the upstream commit. The browser
dispatcher applies the selected PHP version during `initialize`; stub source
paths and native parameter availability feed version-aware function and
signature resolution; and named-argument completion is disabled below PHP
8.0. The `lsp-dispatch` Cargo feature exposes the existing synchronous
dispatcher to the native wrapper, while the crate root re-exports the four
existing WASI ABI functions. The dispatcher remains private, and
`wasm_wasi` remains the only ABI implementation owner. The local changes are
in the tracked Rust files and manifest; builds do not apply a patch.

## Updating the snapshot

Download the desired upstream commit archive and verify its SHA-256 before
updating this directory. Review the local browser-runtime changes against that
source, carry them forward as ordinary source edits, and update the pinned
stubs and workspace lock only when their inputs change. Keep the license and
Cargo targets, tests, fixtures, benches, examples, and build script required
by the crate. Do not add a nested workspace, a duplicate wrapper, or fork
workflow metadata here.

PHPantom is distributed under the MIT License; see
[`phpantom_lsp/LICENSE`](phpantom_lsp/LICENSE).
