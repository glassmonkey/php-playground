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
| Pipe operator `|>` | 8.5 | syntax not supported | parser accepts | isolated expression in [`syntax-85.php`](syntax-85.php) |
| `array_is_list(array $array): bool` | 8.1 | no builtin completion/signature | builtin completion/signature available | natural `array_is_`; complete and inspect signature |
| `array_first(array $array): mixed`, `array_last(array $array): mixed` | 8.5 | no builtin completion/signature | builtin completion/signature available | natural `array_f` / `array_l`; complete and inspect signature |
| Existing common fixture (`greetUser`, `$greeting`, `Greeter`, `$greeter->`, `Greeter::`, `strl`/`strlen`) | 7.4-compatible subset | must remain usable | must remain usable | identical full text/cursor and natural input in both versions; raw items and visible rows recorded separately |

The prior PHP 8.5 control run supplies regression observations, not exact ranking requirements: `strl` raw 4/visible 4; `$gre` 2/2; `$greeter->` 3/3 (`message`, `create`, `greet`); `Greeter::` 2/2 (`class`, `create`); `new Gre` raw 5/visible 2. `greetUser(` and `strlen(` each yielded a named-argument completion candidate. PHPantom showed both builtin and local function signature help and hover on `$greeter`. Preserve these as behavior checks while allowing order/detail differences; use raw Worker items to avoid counting Monaco word suggestions as LSP results. See the prior [8.5 trace](../evidence/phpantom-2026-10-25T12-30-40-981Z/trace.json) and [candidate comparison](../evaluation.md#同じ入力での観測).

PHP manual sources: [7.4 new features](https://www.php.net/manual/en/migration74.new-features.php), [8.0 new features](https://www.php.net/manual/en/migration80.new-features.php), [8.1 new features](https://www.php.net/manual/en/migration81.new-features.php), [8.2 release features](https://www.php.net/releases/8.2/en.php), [`str_contains`](https://www.php.net/manual/en/function.str-contains.php), [`array_is_list`](https://www.php.net/array-is-list), [8.5 release features](https://www.php.net/releases/8.5/en.php), [`array_first`](https://www.php.net/array-first), [function arguments/named arguments](https://www.php.net/manual/en/functions.arguments.php), [enum overview](https://www.php.net/manual/en/language.enumerations.overview.php), [properties/readonly](https://www.php.net/manual/en/language.oop5.properties.php). The expectation concerns PHP core availability and syntax. Extensions, stubs bundled in the build, and engine version actually applied can affect observed completions and must be recorded.

## Separate evidence categories

1. **Selected version applied:** capture the UI selection plus Worker initialize request/response (including `initializationOptions.phpVersion` or equivalent), reinitialize/didOpen order, and a version-sensitive raw completion. UI selection alone does not prove the engine changed.
2. **Parser acceptance:** capture the full isolated syntax fixture and any parser/compiler response. Do not infer acceptance from coloring or absence of a diagnostic if this build does not publish diagnostics.
3. **Completion/signature:** record natural input text, model version/cursor, raw LSP items and metadata, displayed Monaco rows, and hover/signature content separately. No Ctrl+Space as pass criteria.
4. **Diagnostics:** capture `textDocument/publishDiagnostics` (or explicitly note the channel is absent) and UI diagnostics independently from parsing, runtime preview errors, and completion results. Missing diagnostics are “not reported/unknown”, not a pass.

## Browser sequence after manager readback

Use agent-browser in an isolated session, same common fixture, same cursor and natural-key input. At 7.4, check common symbols and absence/presence for the versioned builtins; exercise each 8.0/8.1/8.2/8.5 syntax sample independently. Switch 7.4 → 8.5 → 7.4 in the same page and verify Worker reinitialization, per-version natural completion, rows/diagnostics, and that results from the previous generation do not appear after the switch. For stale state, start natural input that yields a version-sensitive request, switch versions before its response if response latency permits, then type the same prefix after reinitialization; record old-worker termination/late response and rows as separate boundaries. If old Worker termination prevents delivery, record “not delivered after termination,” not a proven product generation guard. Re-run the common fixture after each switch (`strl`, `$gre`, `$greeter->`, `Greeter::`, `greetUser(`, `strlen(`, hover). Keep the existing 8.5-only failure as the pre-change baseline; do not present it as a new-build result.

For every run record browser/tool version, timestamp, #421 source head and loaded asset hash/dirty status supplied by manager, selected version, applied-version evidence, full document/model version/cursor, natural input, initialize/didOpen/request/response ordering, raw and visible candidates, signature/hover, diagnostics and any page/preview error. Preserve screenshots and traces by run. No build, product source edit, or browser measurement is performed until manager readback supplies the new head/build.
