# Next-run scenario: resolve-cache before PHP 7.4 negative checks

Preparation only. Do not run until manager readback confirms the next #421 source head and Worker-loaded WASM hash. Keep the head-957 failure and head-91639 evidence immutable and report the new run separately.

## Purpose

The manager's source-reviewed hypothesis is that resolving `strlen` can populate a Core function cache and resolving `array_fill` can populate a `standard_8` function cache, with those caches entering `global_functions` through a path that bypasses the version index filter. The next browser pass must test the negative cases after both representative resolves. This is a hypothesis to verify, not a browser-established fact.

## Controlled sequence

1. Use a new isolated agent-browser session at the manager-approved URL, PHP 7.4 selected, Completion ON. Before interpreting candidates, record the actual Worker WASM request URL/status/bytes/SHA-256 using the temporary Worker-target diagnostic described in [head 91639 report](browser-2026-10-27-head-91639.md). Confirm hash against the manager's READY value. Capture initialize request/serverInfo and current `didOpen`.
2. Prepare the 7.4-compatible common fixture with Monaco API and put the cursor after `$value = `. Type `strl` naturally. Save exact `didChange` version, completion request/response, raw items and visible rows as the common positive control.
3. In the UI, select the `strlen` row (natural input only; no Ctrl+Space). Capture the corresponding `completionItem/resolve` request and response. Confirm the selected row is actually `strlen` and record insertion/selection result. This is the Core-cache priming action.
4. Replace the document with the same candidate-free valid text `<?php\n$x = ` (actual newline, no target names anywhere in the document), type `str_c` naturally and wait for a matching response. Under selected PHP 7.4, check raw LSP and visible rows separately for `str_contains`. Absence requires a matching response; empty widget/no request is inconclusive.
5. Reset to the same candidate-free document and type `array_f` naturally. In the UI select the `array_fill` row, then verify a matching `completionItem/resolve` request and response. This is the `standard_8`-cache priming action.
6. Reset the exact same document and type `array_f` naturally again. Capture final `didChange`/model version, cursor, completion request/response, raw item labels and visible rows. Check `array_first`, `array_find`, and `array_find_key`.
7. Reset and type `array_l` naturally to test `array_last` with a matching request/response. Keep results separate from the `array_f` candidate family.
8. If time allows, switch through the UI to 8.5 and repeat `str_c`, `array_f`, `array_l` as positive controls; switch back to 7.4 and repeat them. Verify fresh initialize/serverInfo/didOpen on both transitions. Preserve the primed-before-switch state and the unprimed cold-worker results as distinct cases; do not attribute cross-worker state to the resolved sibling cache.

## Validity and evidence rules

- Use keyboard input to produce prefixes. Do not use Ctrl+Space as a substitute for automatic completion.
- Associate every absence with the same final document text/model version, cursor position, PHP initialize/serverInfo, request ID, response ID and UI rows. Store raw items independently from Monaco rows.
- The candidate names must not occur in the document before each query, so Monaco word suggestions cannot manufacture the target name.
- Preserve each `completionItem/resolve` response and document edit caused by selecting a row. If selection or resolve did not occur, label the cache-primed case invalid/unverified and do not claim a cache result.
- Keep browser/server startup errors, blank UI, missing request, pending response and actual empty/filtered response as different outcomes.
- Record instrumentation: the Worker-fetch hash wrapper clones only the WASM response and asynchronously reads the clone; its memory/CPU/startup pause is diagnostic overhead. Make no latency claims from this run.
- Do not edit PHPantom/Worker product code, change ranking, rebuild, or compare an unapproved head. The next manager READY gate is required before opening the measurement session.
