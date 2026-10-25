# GLA-115 quick-suggest diagnosis (before HMR)

- Captured: 2026-10-25 13:58:25 UTC
- Branch/head: `gla-115-lsp-phpactor-preview` / `ee48f4733c802fa39fc3abd54441dd9737017ee8`
- Preview: `http://127.0.0.1:3471/?v=8.5&f=html`
- Vite owner: PID `89149`, cwd `/Users/glassmonkey/src/github.com/glassmonkey/php-playground-wt/gla-115-lsp-phpactor-preview`; listener `127.0.0.1:3471`; HTTP 200 `text/html`, ETag `W/"7e7-8dzfdjFsJhtSHnmUjw78GwJnSNQ"`.
- Existing isolated-browser trace: `../str-underscore-2026-10-25T13-36-15-355Z/phpactor.json` (PHP 8.5, Completion ON, actual `str_` keystrokes). It records one completion RPC at the partial `s` prefix, an old-version Worker response with 168 items, later didChange versions through `str_`, no RPC at the final version, and no visible rows. A manual request at the final version returned 19 items and showed 12 rows.
- Source cause: provider code treated every Monaco `triggerKind === 0` as manual (`automatic = triggerKind !== 0`). Monaco uses `Invoke` for quick suggestions as well as explicit invocation, so a natural word suggestion bypassed the existing settle/cancellation/barrier path. This matches the early partial-prefix RPC and the stale-version discard. Worker asset/backend changes are not indicated by this evidence.
- Planned fix: consume an explicit recent Ctrl/Meta+Space marker from the editor; treat all other provider calls as automatic. Keep the existing settle duration and stale-version guard.
- This is a diagnosis from source + Worker message trace; the prior capture did not record provider context/cancellation. The post-HMR isolated browser trace will record the source instrumentation and verify the trigger classification and latest-version request.
