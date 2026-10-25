# Phpactor completion preview

This branch connects Phpactor's PHP-WASM worker to the existing Monaco editor.
The preview is off by default. It uses the selected PHP version for analysis
only when that version is PHP 8.5; the worker runs on the existing PHP 8.5
runtime. Other selections show a short explanation and do not start the worker.

## Run locally

From this worktree:

```sh
npm ci
scripts/lsp/phpactor/build-assets.sh
npm run dev -- --host 127.0.0.1 --port 3471 --strictPort --open false
```

Open <http://127.0.0.1:3471/> and choose PHP **8.5**. Turn on **Completion**,
beside **HTML Preview**. Turning it off disposes the worker and Monaco providers.
Changing the PHP version closes the current client before any replacement is
started. Completion mode is not stored in the URL, and the editor's current
text is sent to the worker without reinitializing the editor.

The asset builder fetches the pinned Phpactor 2026.10.07.0 PHAR and builds the
WASM data package. `phpactor.data` and `phpactor-loader.js` are local generated
assets ignored by Git. The PHP 8.5 WASM runtime is shared with the existing
playground. Node 24.12.0, PHP with Phar, Docker, `curl`, and `shasum` are needed
to rebuild the Phpactor package.

## Try completion and help

Replace the editor contents with:

```php
<?php
$hello = 'world';
$hel
strl
strlen(
```

- After `$hel`, request completion with **Ctrl+Space** (or **Option+Escape** on
  macOS). Phpactor returns `$hello` as both the label and `insertText`; the
  preview replaces the typed dollar-prefixed variable without duplicating `$`.
- After `strl`, request completion. Phpactor returns `strlen` with a parameter
  snippet.
- Place the caret inside `strlen(|)` to see its signature. Hover a function use
  such as `strlen` to see its description.
- Try `$date->` or a same-file instance member for member completion. Phpactor
  returned instance and static members in the WASM harness. Same-file class
  name completion (`new Gre`) returned no items in that harness.

The verified analysis version is PHP 8.5. PHP 8.4 is not enabled because it has
not been verified with the actual Phpactor worker. Runtime PHP 8.5 and the
analysis setting are separate. No PHP 8.4 analysis result is shown as 8.5.

## Optional completion timing trace

For a local development session, enable the temporary console trace in browser
devtools and reload:

```js
localStorage.setItem('phpactorLspTrace', '1');
location.reload();
```

The `[phpactor-lsp]` entries record manual shortcut, provider invocation,
automatic-trigger settling, RPC send/response, candidate adoption, and discard
reason. They include elapsed times and document versions, not source text. An
`Invoke` provider context can be either Ctrl+Space or Monaco quick suggestions;
the shortcut marker distinguishes explicit invocation. Clear the trace flag
after recording:

```js
localStorage.removeItem('phpactorLspTrace');
location.reload();
```

The browser RPC duration includes Worker queue delay and Phpactor handling; the
client cannot split those without changing the Worker lane. The Node/WASM
harness reports per-handler request times separately and is not a browser
measurement.

## Timing investigation

At UI commit `3ec20ba`, the provider accepted only model and position, sent each
request immediately, and discarded its result when the model version changed.
It did not use Monaco's `CompletionContext` or `CancellationToken`. Monaco's
quick-suggestion path applies its own `quickSuggestionsDelay` (100 ms by
default here); explicit trigger-character calls such as `$` follow a separate
path. The Phpactor Worker then serializes JSON-RPC messages and invokes its PHP
handler for each completion. This identifies two independent timing sources,
but does not prove they were the only causes of the user's observed difference.

The follow-up UI change lets automatic triggers settle for 100 ms, resetting
that timer while text changes, then sends the latest model version and cursor.
Manual `Invoke` calls skip this extra wait. An automatic request waits behind
an in-flight completion; newer automatic invocations supersede older unsent
ones. A canceled unsent request is not sent. If cancellation happens after
send, the UI call returns an empty result without an error, while the Worker
request continues; version checks still prevent stale results from being
adopted.

One Node/WASM harness run during this investigation measured asset/runtime
initialization at 225 ms. Handler times were: first variable completion 498 ms,
warm variable completion 316 ms, builtin completion 222 ms, same-file function
completion 181 ms, same-file class completion 151 ms with no items, instance
member completion 222 ms, static member completion 240 ms, builtin signature
help 158 ms, local-function signature help 110 ms with a `null` result, and
hover 129 ms. These single-run Node measurements include Phpactor handler work
but exclude browser provider delay and browser Worker queue waiting. They do
not establish a before/after browser improvement. The Worker source was not
changed for this follow-up.

## Verification recorded for this branch

| Entry point                                                            | Result          | Evidence                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                               | Passed          | Completed in this worktree.                                                                                                                                                                                                      |
| `npm run build:types:general`                                          | Passed          | TypeScript project check, exit 0.                                                                                                                                                                                                |
| `npm run lint:js`                                                      | Passed          | ESLint, exit 0.                                                                                                                                                                                                                  |
| Phpactor client/version tests                                          | Passed, 8 tests | `npx vitest run src/lsp/__test__/client.spec.ts src/lsp/__test__/phpactor-version.spec.ts`; covers actual WASM variable item insertion, automatic settle/coalescing, cancellation, stale response rejection, and version policy. |
| `npm run build`                                                        | Passed          | Vite production build; existing large-chunk warning remains.                                                                                                                                                                     |
| `node --experimental-strip-types scripts/lsp/phpactor/verify-wasm.mjs` | Passed          | Actual PHP 8.5 WASM and Phpactor handlers returned variable/function/member completion, builtin signature help, and hover. Local function signature help returned `null`; same-file class completion was empty.                  |
| `PORT=9303 node scripts/lsp/phpactor/verify-vite.mjs`                  | Passed          | Vite worker bundle plus HTTP GETs: PHP WASM 200 `application/wasm`, data 200 with no Content-Type, loader 200 `text/javascript`; byte counts matched the pinned local assets.                                                    |

The app has not been driven in a browser by the implementer. The local HTTP
asset check and Node/WASM harness do not verify browser Worker startup or
Monaco interaction; please verify the steps above in the browser.
