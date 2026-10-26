# Completion candidate Loading timing

## Scope and setup

Read-only diagnosis for the UI/client at source HEAD `e4f36cb8d1544369712ecbbf2a17e704b0a0a633`. No source, settings, or server changes were made for this investigation.

- Isolated `agent-browser` named session; URL `http://127.0.0.1:3471/?v=8.5&f=html`.
- PHP 8.5 selected and Completion enabled. The shared PHP fixture was loaded, the Phpactor Worker had initialized, and natural typing used `str_`; no Ctrl+Space.
- Browser `performance.now()` client trace was correlated with a DOM observer on Monaco's `.suggest-widget .message`, `.monaco-list-row` count, visibility, and message display state. The application diagnostic trace was enabled only in this isolated browser session.
- This is one representative browser trial. The `agent-browser` key commands included nominal 160 ms pauses, but tool overhead made observed provider invocation gaps 354–458 ms. Do not interpret this as a controlled 160 ms/key benchmark.

## Observed timeline

Times are milliseconds on the page's `performance.now()` clock; they are not wall-clock timestamps.

| Event | Time | Detail |
| --- | ---: | --- |
| Natural input sequence started | 23472 | Fixture ended with a newline before typing. |
| Provider 1 invoked | 23567 | Model version 3, trigger kind `0`; no manual shortcut was used. |
| Automatic settle completed and request 1 sent | 23670 | Provider trace measured 103 ms before send; LSP position line 8, character 2. |
| Provider 2 / request 2 | 24025 / 24126 | Model version 4; previous provider was cancelled, but its Worker request continued. |
| First visible Monaco `Loading...` | 24080 | `.suggest-widget .message` displayed `Loading...`; 0 rows. This begins after the earlier request was already sent. |
| Provider 3 / request 3 | 24380 / 24482 | Model version 5; cancelled request 2 continued in the Worker. The widget briefly hid and reopened. |
| Provider 4 / final request | 24734 / 24836 | Model version 6, final `str_`; request position line 8, character 5. |
| Old Worker responses | 27413 / 29319 / 31232 | Requests 1–3 returned after provider cancellation, respectively 3743 / 5193 / 6750 ms after send. |
| Latest response and adoption | 31641 / 31642 | Request 4 response after 6806 ms; 19 raw items were adopted for model version 6. |
| Monaco Loading message hidden; 12 rows present | 31651 | Final widget state had 12 visible rows. |

The `Loading...` message was visible in three intervals: approximately 24080–24380 ms, 24444–24734 ms, and 24795–31651 ms. Brief widget hide/reopen intervals totalled about 125 ms. Across the observed intervals the message was visible for about 7.45 seconds and the final result appeared about 7.57 seconds after its first visible appearance. The final provider stayed pending for about 6.9 seconds from invocation through adoption.

## What the Loading row represents

The observed row is Monaco's native suggest-widget `.message` element, not the app's `LoadSpinner` used while the editor mounts or while the PHP preview runs. Its text was `Loading...` while the widget had no completion rows; after the active provider returned 19 items, Monaco hid that message and showed 12 rows.

The client source explains the pending interval:

1. An automatic `provideCompletionItems` call returns a pending promise while it waits for the existing 100 ms settle interval, and then for its Worker response.
2. The measured calls for versions 3–6 each passed the settle interval and sent an RPC. In this trace the retry path did not emit `automatic-trigger-waiting-for-inflight`: retries marked the current version and bypassed the previous-request barrier.
3. On newer input, `raceCompletionCancellation` lets the old provider promise finish as cancelled, but it does not abort the Worker request. The client trace recorded `cancelled-in-flight; worker-request-continues`; all three old Worker responses arrived later.
4. The newly invoked provider remains pending for its own response. The newest response is adopted only if its model version is still current, and that return ends Monaco's Loading state.

This supports a client-side explanation for the observed Loading duration: the provider promise remains pending while the newest request is processed, after repeated dispatches for earlier text. It does not establish that the Phpactor engine alone causes the delay. The p4 boot measurements are Node-hosted WASM timings and are not directly comparable with these browser Worker measurements.

## Small improvement options; no changes made

1. **Latest-only single-flight for automatic completion.** While one Worker completion is outstanding, cancel/drop intermediate provider generations without dispatching each newer version. When the outstanding response settles, send at most one request using the latest document version and cursor. This could reduce queued work and the repeated Loading/reopen cycle. Correctness risks: a latest request may wait behind one slow old request; ensure the queued latest snapshot and position are refreshed, cancellation/OFF/version switch still clear it, and stale responses never appear. This is the most direct way to reduce work rather than mask the indicator.
2. **Adjust when Monaco opens automatic suggestions.** A modest trailing delay before automatic provider invocation could avoid starting a request for every character during ordinary typing. It trades earlier suggestions for fewer requests and may make suggestions feel slower after a pause; it does not shorten a request already running. Manual requests must remain immediate.
3. **Keep the Loading indicator truthful.** Hiding or replacing the native Loading message alone would not reduce the observed wait and would obscure a pending provider. Treat a visual-only change as cosmetic, not a latency improvement.

No option was implemented or benchmarked. The user remains the decision maker for any follow-up.

## Browser evidence limits

- One browser session and one natural `str_` input sequence only; timings can vary with browser and host load.
- The key automation used nominal 160 ms pauses, but actual provider gaps were 354–458 ms. No claim is made for exact 160 ms natural typing.
- No member-completion trial, production/browser-tab check, worker-internal profiler, or source change was performed.
- The isolated browser session was closed. The user tab and server process were not touched; port 3471 remains the existing preview server.
