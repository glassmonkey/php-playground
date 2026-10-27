# PHPantom PHP 7.4 / 8.5 evaluation plan

## Scope and current baseline

This is an evaluation plan for the PHPantom language version selection work in #421. No new build/head has been received or measured. The existing measured head `863c1337adb05a339dbbd6eb20a9c26eb7b63316` / PHPantom WASI 0.11.1 does not apply `initializationOptions.phpVersion`: the Worker returns `-32602` when sent 8.4 and says it continues with its PHP 8.5 default. The UI then shows “PHP 8.4 is unsupported. PHPantom uses PHP 8.5.” See [existing trace](../evidence/phpantom-2026-10-25T12-30-40-981Z/trace.json), including the version-84 state screenshot. This is evidence of the old build limitation, not evidence about a new build.

## Expected version boundaries from PHP primary docs

| Capability | First PHP version | 7.4 expectation | 8.5 expectation | Browser/LSP evidence to capture |
|---|---:|---|---|---|
| `str_contains(string $haystack, string $needle): bool` | 8.0 | no builtin completion/signature | builtin completion and signature available | natural `str_c` prefix; complete call then inspect signature/help |
| Named arguments (`parameter: value`) | 8.0 | syntax not supported | parser accepts; parameter-name completion can be checked | [`syntax-80-named-arguments.php`](syntax-80-named-arguments.php); valid and in-progress call; diagnostics separately |
| Nullsafe `?->` | 8.0 | syntax not supported | parser accepts | [`syntax-80-nullsafe.php`](syntax-80-nullsafe.php); compare with ordinary `->` member completion |
| `match` expression | 8.0 | syntax not supported | parser accepts | [`syntax-80-match.php`](syntax-80-match.php); isolate parser/editor diagnostics |
| Enum declarations/cases | 8.1 | syntax not supported | parser accepts; enum/case members may be checked | [`syntax-81-enum.php`](syntax-81-enum.php), then type `Status::` and natural `D` |
| Readonly property | 8.1 | syntax not supported | parser accepts | [`syntax-81-readonly-property.php`](syntax-81-readonly-property.php); inspect `$obj->` completion independently |
| Readonly class | 8.2 | syntax not supported | parser accepts | [`syntax-82.php`](syntax-82.php); distinguish parser acceptance from member completion |
| Typed class constants | 8.3 | syntax not supported | parser accepts | [`syntax-83-typed-class-constant.php`](syntax-83-typed-class-constant.php) |
| Property hooks | 8.4 | syntax not supported | parser accepts | [`syntax-84-property-hooks.php`](syntax-84-property-hooks.php); inspect property completion independently |
| Pipe operator `|>` | 8.5 | syntax not supported | parser accepts | isolated expression in [`syntax-85.php`](syntax-85.php) |
| `json_validate(string $json, int $depth = 512, int $flags = 0): bool` | 8.3 | no builtin completion/signature | builtin completion/signature available | natural `json_val`; complete and inspect signature |
| `array_find(array $array, callable $callback): mixed` | 8.4 | no builtin completion/signature | builtin completion/signature available | natural `array_fi`; complete and inspect callback signature |
| `array_is_list(array $array): bool` | 8.1 | no builtin completion/signature | builtin completion/signature available | natural `array_is_`; complete and inspect signature |
| `array_first(array $array): mixed`, `array_last(array $array): mixed` | 8.5 | no builtin completion/signature | builtin completion/signature available | natural `array_f` / `array_l`; complete and inspect signature |
| Existing `array_map` stub signature | 7.4 / 8.0+ | second parameter variant is untyped `$arrays` (`from 5.3` to `7.4`) | typed `array $array` variant (`from 8.0`) plus variadic `array ...$arrays`; callback and array return remain | [`array-map-signature.php`](array-map-signature.php); request signature help after naturally typing `array_map(`; inspect active parameter text and metadata |
| Removed `each()` | 7.2 deprecated / 8.0 removed | builtin completion/signature may remain with deprecation metadata | no builtin raw completion/signature | [`removed-each.php`](removed-each.php); type `eac` naturally, distinguish raw LSP item from Monaco word rows |
| Existing common fixture (`greetUser`, `$greeting`, `Greeter`, `$greeter->`, `Greeter::`, `strl`/`strlen`) | 7.4-compatible subset | must remain usable | must remain usable | identical full text/cursor and natural input in both versions; raw items and visible rows recorded separately |

The prior PHP 8.5 control run supplies regression observations, not exact ranking requirements: `strl` raw 4/visible 4; `$gre` 2/2; `$greeter->` 3/3 (`message`, `create`, `greet`); `Greeter::` 2/2 (`class`, `create`); `new Gre` raw 5/visible 2. `greetUser(` and `strlen(` each yielded a named-argument completion candidate. PHPantom showed both builtin and local function signature help and hover on `$greeter`. Preserve these as behavior checks while allowing order/detail differences; use raw Worker items to avoid counting Monaco word suggestions as LSP results. See the prior [8.5 trace](../evidence/phpantom-2026-10-25T12-30-40-981Z/trace.json) and [candidate comparison](../evaluation.md#同じ入力での観測).

### Existing function signature and removal evidence

The pre-new-build PHPantom WASM at source worktree head `863c1337adb05a339dbbd6eb20a9c26eb7b63316` was inspected read-only. `assets/lsp/phpantom/phpantom_lsp.wasm` and the corresponding local `public/lsp/phpantom/phpantom_lsp.wasm` had matching SHA-256 `b591013fd512d0f5b815a0074f9646a4742a8af4b90173ff617215356e8444c0`. Extracted stub text contains the `array_map` parameter-level `PhpStormStubsElementAvailable` variants: typed `array $array` from 8.0; untyped `$arrays` from 5.3 through 7.4; and the additional variadic array parameter. The same bundled text contains `each(&$array): array`, `@removed 8.0`, and `Deprecated(... since: "7.2")`. This is evidence from the old available local WASM asset, not the new p6 build or a browser result. The source worktree was dirty with p6's unrelated in-progress source/patch changes; those files were not read or modified.

Relevant extracted stub excerpt (from that hash):

```php
function array_map(
    ?callable $callback,
    #[PhpStormStubsElementAvailable(from: '8.0')] array $array,
    #[PhpStormStubsElementAvailable(from: '5.3', to: '7.4')] $arrays,
    array ...$arrays
): array {}

/** @removed 8.0 */
#[Deprecated(reason: "Use a foreach loop instead", since: "7.2")]
function each(&$array): array {}
```

PHP documents corroborate the selected probes: [current `array_map` signature and behavior](https://www.php.net/array-map), [PHP 8.0 internal-function type/stub initiative](https://wiki.php.net/rfc/internal_method_return_types), [`each()` deprecation/removal notice](https://www.php.net/each), and [PHP 8.0 removal list](https://www.php.net/manual/en/migration80.incompatible.php). The PHPantom [version-aware filtering design](https://github.com/PHPantom-dev/phpantom_lsp/blob/main/docs/ARCHITECTURE.md#version-aware-filtering) explains that these stub availability annotations are selected by target PHP version. Browser expectations remain conditional on proving that the selected version actually reached the engine.


“7.4 syntax not supported” is the PHP language grammar expectation, not a claim that PHPantom will emit a diagnostic. The parser may use a fixed grammar independent of the selected target; if it accepts newer syntax without diagnostics, record parser acceptance and diagnostics separately, and do not infer PHP 7.4 runtime compatibility.

## Separate evidence categories

1. **Selected version applied:** capture the UI selection plus Worker initialize request/response (including `initializationOptions.phpVersion` or equivalent), reinitialize/didOpen order, and a version-sensitive raw completion. UI selection alone does not prove the engine changed.
2. **Parser acceptance:** capture the full isolated syntax fixture and any parser/compiler response. Do not infer acceptance from coloring or absence of a diagnostic if this build does not publish diagnostics.
3. **Completion/signature:** record natural input text, model version/cursor, raw LSP items and metadata, displayed Monaco rows, and hover/signature content separately. No Ctrl+Space as pass criteria.
4. **Diagnostics:** capture `textDocument/publishDiagnostics` (or explicitly note the channel is absent) and UI diagnostics independently from parsing, runtime preview errors, and completion results. Missing diagnostics are “not reported/unknown”, not a pass.

## Browser sequence after manager readback

Use agent-browser in an isolated session, same common fixture, same cursor and natural-key input. At 7.4, check common symbols and absence/presence for the versioned builtins; exercise each 8.0/8.1/8.2/8.5 syntax sample independently. Switch 7.4 → 8.5 → 7.4 in the same page and verify Worker reinitialization, per-version natural completion, rows/diagnostics, and that results from the previous generation do not appear after the switch. For stale state, start natural input that yields a version-sensitive request, switch versions before its response if response latency permits, then type the same prefix after reinitialization; record old-worker termination/late response and rows as separate boundaries. If old Worker termination prevents delivery, record “not delivered after termination,” not a proven product generation guard. Re-run the common fixture after each switch (`strl`, `$gre`, `$greeter->`, `Greeter::`, `greetUser(`, `strlen(`, hover). Keep the existing 8.5-only failure as the pre-change baseline; do not present it as a new-build result.

For every run record browser/tool version, timestamp, #421 source head and loaded asset hash/dirty status supplied by manager, selected version, applied-version evidence, full document/model version/cursor, natural input, initialize/didOpen/request/response ordering, raw and visible candidates, signature/hover, diagnostics and any page/preview error. Preserve screenshots and traces by run. No build, product source edit, or browser measurement is performed until manager readback supplies the new head/build.
