# PHPantom PHP 7.4 / 8.5 browser observations

## Scope and setup

Independent natural-input observations for #421 at source head `95796444b1ea3d7f158f15f378a644e300c67d6c`; branch readback was clean/upstream. URL `http://127.0.0.1:7260/?v=8.5&f=html`; loaded `/lsp/phpantom/phpantom_lsp.wasm` SHA-256 `728e939959531fff3fb1c2d6b47a06b6d9ba4c62233230cc52a000ed528c7534`, matching the manager's build report. Browser tool: agent-browser 0.39.1, isolated session `phpantom-74-85-7845ddba0ec6`; observed 2026-10-27 around 02:25–02:35Z. Completion was enabled in the UI. Inputs were sent using agent-browser keyboard typing; Monaco API was used only to prepare the exact document and cursor before typing. No Ctrl+Space was used.

Wire evidence: [captured Worker JSON-RPC trace](evidence/2026-10-27-new-build-agent-browser-trace.json). The trace includes an early invalid fixture run with a literal `\\n` sequence; it is retained but excluded below. Its parse error and candidate rows are not used as a result.

## Results

| Case | UI version and LSP initialization | Natural input and request | Raw Worker result | Visible Monaco rows | Finding |
|---|---|---|---|---|---|
| Common `strl` | 7.4; initialize option `phpVersion:"7.4"`, serverInfo `0.11.1+php-version-setting.1:php7.4`; full model reopened as version 2 | Common fixture, caret after `$value = `, typed `strl`; model version 12, completion at line 6/character 13 | 4 items: `strlen($string)`, `grapheme_strlen`, `iconv_strlen`, `mb_strlen` | Same 4 rows | Common builtin completion works in this one 7.4 case. |
| Versioned `str_contains` | 8.5 initialize/serverInfo confirmed after UI switch | `<?php\n$ok = ` + typed `str_c`; model version 19, request line 1/character 11 | 4 items including `str_contains` | `str_contains`, `substr_compare`, `substr_count`, `mb_substr_count` | Positive 8.5 control. |
| Same `str_contains` after switching back | 7.4 initialize/serverInfo confirmed; current document reopened | Same text and natural `str_c`; model version 25, request line 1/character 11 | 4 items including `str_contains` | Same 4 rows | **Version-filter negative control failed:** an 8.0+ function is returned and shown after the LSP reports PHP 7.4. This is not merely a Monaco word-based suggestion: the raw LSP item is present. |
| Newer array functions, first 7.4 pass | 7.4 initialize/serverInfo confirmed | `<?php\n$x = ` + typed `array_f`; request at line 1/character 12 | 10 raw items, including `array_first`, `array_find`, and `array_find_key` | 10 rows, including all three | **Negative control failed.** Candidate names were absent from the document before typing. |
| Same prefix in 8.5 | 8.5 initialize/serverInfo confirmed; same two-line document | Same natural `array_f`; request at line 1/character 12 | 10 raw items, including `array_first`, `array_find`, and `array_find_key` | 10 rows, including those items | Positive control returned candidates, but does not establish version filtering. |
| Same prefix after returning to 7.4 | 7.4 initialize/serverInfo confirmed; same document and request position | Same natural `array_f`; request at line 1/character 12 | 10 raw items, including `array_first` | 10 rows, including `array_first` | **Repeated negative control failure after 8.5→7.4.** Selected version reached the server, but newer-only candidate leakage persisted. |
| Removed `each()` | 8.5 initialize/serverInfo confirmed | `<?php\n` + typed `each`; request line 1/character 4 | No exact `each` function item. Results were unrelated substring matches such as `T_ENDFOREACH`, constants, and `*_for_each` names. | Same unrelated matches; no exact `each` row | Consistent with removal in this case; no 7.4 counterpart measured. |
| `array_map` | 7.4 initialize/serverInfo confirmed | Typed `array_map`; request line 1/character 9 | Exact function candidate | One visible row. Resolve documentation showed a mixed signature: `array_map(?callable $callback, $arrays, array ...$arrays, $array = ...): array` | Candidate is available, but displayed signature did not cleanly reflect the expected 7.4-vs-8.x parameter variant. One observation; no 8.5 comparison here. |
| `strrchr` | 8.5 resolve response observed | Typed `strrchr`; raw completion and resolve request | Resolve documentation included `$before_needle` (“Since 8.3”) and `bool $before_needle = false` | `strrchr`, `mb_strrchr` | The known 8.5 metadata is present. A valid 7.4 resolve response was not captured in this run; do not claim the 7.4 leakage from this browser result (the manager separately identified that known limitation). |

The 7.4→8.5→7.4 cycle produced a fresh LSP initialize response each time, with matching `serverInfo` version suffixes and a `didOpen` for the current model. For the `array_f` negative controls, each completion request followed a matching `didChange` for the final `array_f` text, used the same URI and line/character, and had a corresponding response before rows were read. Thus these are valid requests, not empty-page, wrong-version, stale-response, or unrequested-result cases. The raw result itself establishes the `array_first` leakage independent of UI filtering.

The first malformed fixture was invalid because setup inserted the literal characters `\\n`; it caused a PHP preview parse error and was excluded. The corrected common-fixture `strl` and all later version-specific probes used valid PHP text for their relevant cursor context. No parser acceptance/diagnostic conclusion is made: this browser session did not run the language syntax matrix, and this build is known not to publish diagnostics.

## Interpretation and remaining checks

**Observed:** the selected 7.4 value is delivered to PHPantom initialization and reported in `serverInfo`. **Also observed:** the same 7.4 engine returns PHP 8.0+ `str_contains` and PHP 8.5 `array_first` raw completion items, which Monaco then displays. Therefore version delivery works while candidate availability is not filtered by target version for these builtins in this build. This does not show that all versioned stubs behave alike, nor identify whether the cause is in the engine's bundled stub annotations/filtering or another backend layer.

The `array_find` (8.4), `array_find_key` (8.4), and `array_first` (8.5) raw results likewise appear in 7.4. `array_last`, `array_is_list`, `json_validate`, and named-argument behavior were not verified in this browser pass. No static syntax behavior or diagnostics result was measured. `array_map` and `strrchr` signature differences need same-document, same-position paired captures in both versions before drawing a version-comparison conclusion.

## Reproduction

1. Open the URL above in a separate agent-browser session, enable Completion, choose PHP 7.4 in the UI, and wait for the LSP Worker `initialize` response whose serverInfo ends in `php7.4`.
2. Set the document to `<?php\n$x = `, place the caret at the end, and type `array_f` with natural keyboard input. Confirm final `didChange` version/text and completion request at line 1, character 12; inspect raw result labels and visible list rows separately.
3. Change the version with the UI selector to 8.5, verify a fresh initialize/serverInfo and didOpen, then repeat the identical document and input.
4. Switch back to 7.4, verify the new initialize/serverInfo and didOpen, repeat once more. Do not count the result as absence unless a matching request response is captured; here the 7.4 response includes `array_first`.

## Diagnostic follow-up for the implementation owner

The 7.4 build's version initialization is observable, but the version-sensitive completion results are not gated: `array_first`, `array_find`, `array_find_key`, and `str_contains` were all returned by the raw completion endpoint under 7.4. This is evidence for a version-filtering gap in the current candidate pipeline, not a parser/diagnostics result. The evaluation lane did not change implementation code. Any fix and retest require manager coordination; do not treat the 7.4 selection/serverInfo alone as proof of PHP 7.4-safe completion.
