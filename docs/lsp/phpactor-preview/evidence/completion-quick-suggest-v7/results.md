# GLA-115 quick-suggest repair results

## Cause and change

`ee48f4733c802fa39fc3abd54441dd9737017ee8` registered Monaco's `CompletionItemProvider` and classified only non-`Invoke` trigger kinds as automatic. Monaco reports both quick suggestions and explicit Invoke as `triggerKind: 0`; the Worker trace showed automatic typing's early request at partial `s`, followed by a stale-version drop. Thus the code skipped the existing 100 ms settle path for normal word suggestions.

The provider now treats Invoke as automatic unless the editor records and consumes a recent Ctrl/Meta+Space key event. Manual requests still dispatch immediately. If an automatic request is cancelled or its response is stale because the document changed, the client coalesces model edits for the existing 100 ms settle interval and calls Monaco's `editor.action.triggerSuggest` once. The retry checks that its completion generation is still latest, the model still belongs to the client, the editor remains focused, and the client has not been disposed. OFF/version switch disposes the client and cancels a pending retry. No backend, worker source, generated assets, or completion candidate logic changed.

## Isolated browser observation

- URL: `http://127.0.0.1:3471/?v=8.5&f=html`; PHP 8.5 selected; Completion ON.
- Browser: Chromium 156.0.8078.47. All inputs were typed in a fresh isolated browser context; no user tab or source was touched.
- Slow `str_` (150 ms/key): first automatic request was cancelled while in flight. After input settled, retry fired; the newer provider waited for the old worker request to finish, sent against latest model version 11, and adopted 12 visible `str_*` rows. Final rerun's trace measured 1,841 ms for the old worker response and 370 ms for the fresh response after send.
- Fast `str_` (40 ms/key): intermediate provider was cancelled before send; the latest request completed and adopted the same 12 visible rows in 384 ms after send.
- Additional natural-input checks: `strl` showed `strlen`; `$gre` showed `$greeting`; `$greeter->` showed `greet`; `Greeter::` showed class and static method candidates.
- Final evidence with event timestamps, model versions, rows, and errors: `browser-final.json`. `browser-after.json` also records `strl`, `$gre`, `->`, and `::` checks.
- The isolated context also reported `SecurityError` from a sandboxed frame attempting `localStorage` access. It had no Phpactor status error and the completion responses/adoption succeeded, but the console error's frame origin was not attributed. User's browser was not used.

## Server continuity

Before HMR: PID `89149`, cwd this worktree, listener `127.0.0.1:3471`, HTTP 200 `text/html`, ETag `W/"7e7-8dzfdjFsJhtSHnmUjw78GwJnSNQ"` (13:58:25 UTC).

After HMR and final checks: the same PID `89149`, cwd, and listener remained; HTTP 200 `text/html`, ETag `W/"7e7-ZhvI0nGKo519ZMy9eXnHvVodrYg"` (14:08:32 UTC). The preview server was not stopped or replaced.

## Verification

- `npx vitest run src/lsp/__test__/client.spec.ts`: 8 passed.
- `npm run lint:js`: passed.
- `npm run build:types`: passed.
- `npm run build`: passed; Vite retained its existing large-chunk advisory.
- Browser checks above used natural typing; browser-side Ctrl/Meta+Space and PHP 8.4 were not re-tested after the change. Unit tests cover immediate marked manual Invoke, PHP-version initialization/provider lifecycle, stale response rejection, latest-request recovery, and retry cleanup on disposal.
