# Automatic completion single-flight experiment

## Change under test

Baseline: `9eafdcd247ce33dc3b3f2be5f1b34a64747cee76` (`9eafdcd`). The client marked a retry for the current model version as `recoveryRetry` and let that request bypass `completionBarrier`. Model edits during a pending automatic completion could therefore dispatch each retry to the Worker while older cancelled requests continued running.

The experiment removes that bypass. All completion RPCs, including a marked manual request, now wait for the existing completion barrier. The model-change retry keeps the latest provider alive; while it waits, newer provider generations cancel the previous waiter. After the active Worker completion settles, only the current generation can pass the final freshness check and send. The pending-version map now includes automatic and manual completion RPCs so a new model can schedule a latest automatic request even if the stale request began manually.

The barrier covers **completion RPCs only**. Hover, signature-help, and completion resolve requests use the shared `request()` function outside this experiment's completion barrier. No worker/runtime queue, PHP execution, generated asset, or source Worker was changed. A Worker request already posted cannot be aborted by provider cancellation.

## Browser procedure

- Isolated named `agent-browser` session at `http://127.0.0.1:3471/?v=8.5&f=html`; PHP 8.5 selected, Completion ON, shared fixture loaded after Worker initialization.
- Natural text input was `str_`; no Ctrl+Space. Each run returned 12 visible rows from the latest model version.
- The page diagnostic recorded provider/RPC times with `performance.now()`. Warm-run document-change times came from the actual Monaco `onDidChangeContent` event, not the shell's nominal 160 ms sleeps. The `keyboard type` path did not expose DOM `keydown`/`beforeinput` events in this session; all input-to-result timings below are explicitly **last document change → latest response/final rows**, not physical key-to-result timings. A separate `press Shift+Minus` probe produced a `-`, not `_`, and was excluded.
- The browser session was isolated; the user's tab was not opened. Port 3471 remained on the existing server PID 89149.

## Before and after

The before capture used the same PHP fixture and `str_` input on the `9eafdcd` client. Its worker `didChange` timestamps for `s`, `t`, `r`, `_` were 163–164 ms apart. Four completion RPCs were sent: the initial `s`, two intermediate versions, then final `str_`. Three of the four responses were cancelled/stale but still completed in the Worker. The latest response took 6806 ms from its send; Monaco showed 12 rows after about 7.57 seconds of visible Loading intervals. This is one baseline capture, not a benchmark distribution. Full baseline timings are in `completion-loading-2026-10-26.md` and the v8 browser traces.

After the change, four trials used the same fixture and `str_`: one first-request (cold) trial, kept separate, and three warm repeats. Warm model-change intervals were 236–248 ms, slower than the baseline input pacing. The repeated runs therefore do not indicate an improvement caused by faster typing.

| Trial | Completion RPCs sent | Obsolete RPCs that still completed | Latest RPC response after send | Last document change → latest response | Loading span to final rows | Final rows |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| First request (cold, separate) | 2 | 1 | 445 ms | Not captured at the model-edit boundary | 3905 ms | 12 |
| Warm 1 | 2 | 1 | 380 ms | 3258 ms | 3574 ms | 12 |
| Warm 2 | 2 | 1 | 390 ms | 3254 ms | 3576 ms | 12 |
| Warm 3 | 2 | 1 | 416 ms | 3399 ms | 3728 ms | 12 |

In every warm repeat, the initial `s` request was the only obsolete RPC. No RPC was sent for the intermediate `st` or `str` model. That old request finished 3477–3597 ms after send; only then did the client send the final `str_` position, which returned in 380–416 ms. The final request was adopted at model version 11, 17, or 23 respectively. Monaco's Loading message briefly hid/reopened as the old provider was cancelled and a newer one started; across those transitions it remained visible for 3454–3611 ms per warm run.

The comparison shows fewer requests and gives a shorter latest-result interval in these observations. Treat those separately: the before capture is one reference with four RPCs, three obsolete completions, 6806 ms from latest RPC send, and about 7.57 s of visible Loading; after each warm capture sent two RPCs with one obsolete completion and took 3.25–3.40 s from last document change to latest response. It is not a paired performance benchmark: before uses Worker `didChange` timestamps while after uses Monaco model-change timestamps, and each side has only one input pace/sample configuration. The after model edits were slower, but machine/browser scheduling can still differ. The 3.25–3.40 s document-change-to-result interval remains noticeable and includes waiting for the one obsolete Worker request to finish; this change does not cancel that PHP work.

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
