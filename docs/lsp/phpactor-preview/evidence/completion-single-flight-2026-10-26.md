# Automatic completion single-flight experiment

## Change under test

Baseline: `9eafdcd247ce33dc3b3f2be5f1b34a64747cee76` (`9eafdcd`). The client marked a retry for the current model version as `recoveryRetry` and let that request bypass `completionBarrier`. Model edits during a pending automatic completion could therefore dispatch each retry to the Worker while older cancelled requests continued running.

The experiment removes that bypass. All completion RPCs, including a marked manual request, now wait for the existing completion barrier. The model-change retry keeps the latest provider alive; while it waits, newer provider generations cancel the previous waiter. After the active Worker completion settles, only the current generation can pass the final freshness check and send. The pending-version map now includes automatic and manual completion RPCs so a new model can schedule a latest automatic request even if the stale request began manually.

The barrier covers **completion RPCs only**. Hover, signature-help, and completion resolve requests use the shared `request()` function outside this experiment's completion barrier. No worker/runtime queue, PHP execution, generated asset, or source Worker was changed. A Worker request already posted cannot be aborted by provider cancellation.

## Browser procedure

- Isolated named `agent-browser` sessions were used for both baseline and after input, interaction, and measurement collection. Baseline source `9eafdcd` ran from a temporary archive on port 3472; after source ran on the existing port 3471/PID 89149. Both selected PHP 8.5, enabled Completion, loaded the same shared fixture after Worker initialization, and typed `str_` without Ctrl+Space.
- Natural text input was `str_`; no Ctrl+Space. Each run returned 12 visible rows from the latest model version.
- The page diagnostic recorded provider/RPC times with `performance.now()`. Warm-run document-change times came from the actual Monaco `onDidChangeContent` event, not the shell's nominal 160 ms sleeps. The `keyboard type` path did not expose DOM `keydown`/`beforeinput` events in this session; all input-to-result timings below are explicitly **last document change → latest response/final rows**, not physical key-to-result timings. A separate `press Shift+Minus` probe produced a `-`, not `_`, and was excluded.
- The browser session was isolated; the user's tab was not opened. Port 3471 remained on the existing server PID 89149.

## Baseline captures

The new baseline was captured once with agent-browser at source `9eafdcd`, using a temporary server on port 3472. Actual Monaco document-change events were 129073, 129418.5, 129750.3, and 130083.3 ms on the page clock, or 332–346 ms apart. Four completion RPCs were sent; three obsolete responses still completed. The last response arrived 6484 ms after its send and 6688 ms after the last document change. Monaco showed 12 rows after 7077 ms total visible Loading time. The captured page trace and widget transitions are in [`completion-single-flight-baseline-agent-browser.json`](completion-single-flight-baseline-agent-browser.json).

An older Playwright trace remains historical evidence, not this baseline: it recorded 4 requests/3 obsolete responses, 6806 ms from the final request send to response, about 7.45 s of accumulated visible Loading, and about 7.57 s from first visible Loading to final rows. Its source snapshot and input pacing differ; it is not used for the agent-browser comparison here. See `completion-loading-2026-10-26.md` and the v8 traces for that history.

## After capture

After the change, four trials used the same fixture and `str_`: one first-request (cold) trial, kept separate, and three warm repeats. Warm model-change intervals were 236–248 ms, faster than the agent-browser baseline's 332–346 ms. Faster typing does not explain the shorter observed after interval; the input pacing still differs, so this is not an equal-pace comparison.

| Trial | Completion RPCs sent | Obsolete RPCs that still completed | Latest RPC response after send | Last document change → latest response | Loading span to final rows | Final rows |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| First request (cold, separate) | 2 | 1 | 445 ms | Not captured at the model-edit boundary | 3905 ms | 12 |
| Warm 1 | 2 | 1 | 380 ms | 3258 ms | 3574 ms | 12 |
| Warm 2 | 2 | 1 | 390 ms | 3254 ms | 3576 ms | 12 |
| Warm 3 | 2 | 1 | 416 ms | 3399 ms | 3728 ms | 12 |

In every warm repeat, the initial `s` request was the only obsolete RPC. No RPC was sent for the intermediate `st` or `str` model. That old request finished 3477–3597 ms after send; only then did the client send the final `str_` position, which returned in 380–416 ms. The final request was adopted at model version 11, 17, or 23 respectively. Monaco's Loading message briefly hid/reopened as the old provider was cancelled and a newer one started; across those transitions it remained visible for 3454–3611 ms per warm run.

Across these observations, agent-browser baseline sent four requests with three obsolete completions; each after warm run sent two with one obsolete completion. That request-count reduction is directly observed. The timing comparison is only indicative: there is one baseline run and three warm after runs, and actual Monaco model-change intervals differ (baseline 332–346 ms; after 236–248 ms, so after typing was faster). The measured last-document-change-to-result interval was 6.69 s for baseline and 3.25–3.40 s after; visible Loading was 7.08 s and 3.45–3.61 s respectively. These are not controlled equal-pace results and should not be generalized. The after interval remains noticeable and includes waiting for the one obsolete Worker request to finish; this change does not cancel that PHP work.

## Source behavior and boundaries

The `Loading...` text is Monaco's native suggest-widget message. It stays visible while the current completion provider promise is pending across its 100 ms settle, barrier wait, and latest RPC response. Provider cancellation resolves the old UI promise but leaves its posted Worker RPC running. The current source still guards adoption by completion generation, model URI, and model version.

The implementation serializes completion RPCs through `completionBarrier`; it does not serialize hover/signature requests. If a remaining pause comes from those requests sharing the Worker's own queue, this experiment does not address it. Manual shortcut requests also wait behind an in-flight completion now, though they skip the automatic 100 ms settle. Ordinary natural typing remains the exercised path; Ctrl+Space is not required.

OFF/version switch and disposal continue to cancel the retry timer/subscription and dispose providers. Disposal rejects pending requests and terminates the Worker. The client tests cover queued manual completion, latest-version recovery, stale response rejection, and disposal while a newest request waits at the barrier. No PHP 8.4 UI rerun was done; the existing 8.4 policy code was not changed.

## Local verification

- `npx vitest run src/lsp/__test__/client.spec.ts`: 12 tests passed.
- `npm run lint:js`: passed.
- `npm run build:types`: passed.
- `npm run build`: passed; Vite retained its existing large-chunk advisory.
- CI remains with the assigned secretary; this experiment did not run or watch CI.

This is a small UI/client experiment, not a claim of Phpactor/PHPantom parity. No full worker parallelism, forced PHP interruption, persistent container, spinner-only change, or further optimization was attempted.
