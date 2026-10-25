# PHPantom LSP preview

This preview connects the official PHPantom 0.11.1 WASI server to the existing
Monaco editor. It runs locally in a browser Worker. The analysis server currently
uses PHP 8.5 only; choosing another execution version remains available, but the
LSP preview reports that version as unsupported instead of analyzing it as 8.5.

## Try it locally

The preview was prepared in this worktree:

- Worktree: `/Users/glassmonkey/src/github.com/glassmonkey/php-playground-wt/gla-115-lsp-preview`
- Branch: `gla-115-lsp-preview`
- Base: `be516894ac2dd0ff76b4e436684e0db53a350eff`
- PHPantom adapter commit: `159d15ee50dd65dddef6dabb2c3044ece668ce6d`
- Integrated preview implementation commit: `c3a651d3cb0d1920a9a628d0680ff1de694f15a7` (the submitted branch adds a documentation-only commit after this revision).
- Port: `7260`

From that directory, run:

```sh
npm ci
./scripts/lsp/phpantom/fetch-wasm.sh
npm run dev -- --host 127.0.0.1 --port 7260 --strictPort --open false
```

Open <http://127.0.0.1:7260/>. Select PHP version **8.5**, then turn on
**PHPantom completion**. The status changes to “PHPantom ready” after the
Worker initializes. Turning the switch off stops that Worker and removes its
providers. With the switch still on, change the execution version to **8.4**:
the status reports that PHPantom 0.11.1 WASI does not support 8.4, and no LSP
completion provider remains active. Change back to **8.5** while the switch is
still on; the Worker initializes again. The existing PHP execution version
selector remains available and is not changed by the preview.

The WASM file is a pinned upstream release asset and is deliberately not in Git.
The fetch script verifies its SHA-256 and writes
`assets/lsp/phpantom/phpantom_lsp.wasm`. Run it again after a clean checkout.
The app's initial page also loads Monaco through its existing browser loader,
so the browser needs network access to that existing Monaco distribution.

## Try completion, hover, and signature help

Replace the editor contents with this sample:

```php
<?php
class Widget {
    public function run(string $message): string { return $message; }
    public static function create(): self { return new self(); }
}
function makeWidget(): Widget { return new Widget(); }
$widget = makeWidget();
$widget->run('ready');
Widget::create();
$date = date_create();
$date->format('Y');
```

- **Completion:** place the caret after `->` on `$widget->run('ready');` and
  press **Ctrl+Space** (or **Option+Escape** on macOS). `run` should be offered.
  Try after `Widget::` and `$date->` as well.
- **Hover:** point at `run` in `$widget->run(...)` and wait for the type and
  method information.
- **Signature help:** place the caret inside `run(|'ready')`; the parameter
  `string $message` should be shown. It can also appear while typing the call.

PHPantom analyzes the active document. It does not index other open files or
provide workspace-wide diagnostics. The preview does not persist the LSP mode in
the URL.

## Verification scope

| Check                                                        | Result                          | Detail                                                                                                                                                     |
| ------------------------------------------------------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build:types`                                        | Passed (exit 0)                 | TypeScript project check.                                                                                                                                  |
| `npm run build`                                              | Passed (exit 0)                 | Vite production build; existing Sandpack `eval` and large-chunk warnings remain.                                                                           |
| `node scripts/lsp/phpantom/smoke-test.mjs`                   | Passed                          | Actual release WASM/WASI exercised completion, hover, signature help, resolve, request IDs, errors, and PHP-version policy.                                |
| `npx vitest run src/workers/__test__/usePHP.spec.ts`         | Passed (3 tests)                | Existing PHP-version change behavior.                                                                                                                      |
| `npx vitest run src/lsp/__test__/client.spec.ts`             | Passed (1 test)                 | Checks stale completion rejection, provider disposal, PHP 8.4 refusal, and PHP 8.5 reinitialization.                                                       |
| `npm run test:ci`                                            | Failed (33 passed, 6 timed out) | Existing `php-worker.spec.ts` WASM startup cases for PHP 5.6 and 7.0–7.4 exceeded the configured 5-second timeout.                                         |
| `npm run test:ci -- src/workers/__test__/php-worker.spec.ts` | Failed (28 passed, 4 timed out) | Isolated run timed out on PHP 5.6, 7.0, 7.1, and 7.2.                                                                                                      |
| Same isolated worker test at base `be516894`                 | Failed (30 passed, 2 timed out) | Unchanged base also timed out on PHP 5.6 and 7.0, indicating this failure exists outside the preview changes; the failing version set varied between runs. |
| HTTP `GET /` and WASM asset                                  | Passed (200/200)                | Local Vite server on `127.0.0.1:7260`; PID and separate startup logs are held by the operator.                                                             |

The browser Worker and editor UI have not been verified by the implementer. A
successful local HTTP response only confirms that Vite serves the page and WASM
asset; it does not confirm browser WASI startup or Monaco provider behavior.
Please verify the steps above in the browser. PHP 8.4 is intentionally rejected
by PHPantom 0.11.1 WASI for this preview; PHP 8.5 is the supported analysis
version.
