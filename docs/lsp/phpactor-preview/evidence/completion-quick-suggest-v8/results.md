# GLA-115 quick-suggest retry WIP results

This WIP records the additional attempt after baseline commit `4fd516045ee6aa958bb01c78be5cb76205537894`. It is not an accepted fix: natural slow `str_` completion is still unresolved, and the latest repeated browser capture did not capture a usable completion request.

## Change under review

The dirty source diff tracks in-flight automatic completion requests by model version. When typing advances the model while one remains pending, it schedules one settled retry for the current model. The retry marks its model version so the provider can bypass the old completion barrier. The editor hides and reopens Monaco's suggest widget to reach the provider again when that widget prevented a fresh invocation. The tests cover cancellation, a pending stale Worker response, and provider re-entry. This is a UI/client experiment; no Worker/backend or candidate-generation code changed.

## Baseline and browser evidence

- Manager-provided p8 trace, PHP 8.5 / Completion ON / shared fixture / 160 ms per key: at model version 6 (`str_`), the only request was at line 7, character 1 (`s`); there was no latest-version request or response and no rows after 1800 ms. This is the valid failing observation for commit `4fd5160`.
- `repeat-p8-final.json` is an intermediate attempt before the widget-reset change. Both slow trials had requests at characters 1 and 3 only and no rows; both 10 ms trials had a request at character 4 and 12 rows. It does not represent the final dirty diff.
- `provider-correlated-slow-widget-reset.json` is a valid provider-correlated trial of the dirty widget-reset source: at 1800 ms it had sent requests at characters 1 and 4, with no rows yet. After Worker responses, the latest request returned 19 raw items and Monaco displayed 12 rows. This shows latest-request recovery in that trial, but not candidate display within 1800 ms or repeatability across slow trials.
- `held-response-replay-after-widget-reset.json` records a held-response trial of the same dirty source: it sent the latest character-4 request and eventually displayed 12 rows after replies. This does not establish normal Worker latency or repeated natural-input success.
- `repeat-fast-after-widget-reset.json` records two 10 ms trials with 12 visible rows each; its captured LSP response contained 19 items. Fast-input success does not establish slow-input success.
- `repeat-widget-reset-final.json` is the last repeated browser capture. Although its editor text ended in the shared fixture plus `str_`, its instrumentation did not capture a Phpactor completion request in any trial. Treat this capture as invalid for completion behavior; do not infer either backend failure or successful recovery from its empty rows.
- No browser trial here changes the user's open tab. Browser-side natural slow `str_` remains unresolved. The observed recovery is a client/UI result and does not establish a Phpactor engine limitation.

## Verification of the dirty attempt

These commands were run by the task operator against the dirty source/tests represented by this WIP:

- `npm run lint:js`: passed.
- `npm run build:types`: passed.
- `npx vitest run src/lsp/__test__/client.spec.ts`: 11 tests passed.
- `npm run build`: passed, with Vite's existing large-chunk advisory. The later changes before this save were limited to test typing; production source was unchanged after the build.

These checks validate the local dirty attempt; they do not establish acceptance of the slow natural-input behavior. CI remains under the secretary's monitoring assignment. No new validation was run while preparing this WIP save.

## Publication status

The source and tests in this directory are WIP and remain unaccepted. Compare them with baseline `4fd5160`; do not describe this as a stable fix. The existing user server on port 3471 continues to serve the working tree and was not stopped or replaced.
