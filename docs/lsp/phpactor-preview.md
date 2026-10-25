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

## Verification recorded for this branch

| Entry point                                                            | Result          | Evidence                                                                                                                                                                                                        |
| ---------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                               | Passed          | Completed in this worktree.                                                                                                                                                                                     |
| `npm run build:types:general`                                          | Passed          | TypeScript project check, exit 0.                                                                                                                                                                               |
| `npm run lint:js`                                                      | Passed          | ESLint, exit 0.                                                                                                                                                                                                 |
| Phpactor client/version tests                                          | Passed, 4 tests | `npx vitest run src/lsp/__test__/client.spec.ts src/lsp/__test__/phpactor-version.spec.ts`; includes the actual WASM variable item shape.                                                                       |
| `npm run build`                                                        | Passed          | Vite production build; existing large-chunk warning remains.                                                                                                                                                    |
| `node --experimental-strip-types scripts/lsp/phpactor/verify-wasm.mjs` | Passed          | Actual PHP 8.5 WASM and Phpactor handlers returned variable/function/member completion, builtin signature help, and hover. Local function signature help returned `null`; same-file class completion was empty. |
| `PORT=9303 node scripts/lsp/phpactor/verify-vite.mjs`                  | Passed          | Vite worker bundle plus HTTP GETs: PHP WASM 200 `application/wasm`, data 200 with no Content-Type, loader 200 `text/javascript`; byte counts matched the pinned local assets.                                   |

The app has not been driven in a browser by the implementer. The local HTTP
asset check and Node/WASM harness do not verify browser Worker startup or
Monaco interaction; please verify the steps above in the browser.
