# WIP UI snapshots (not a comparative rerun)

Observed on 2026-10-25 UTC between 15:20:51 and 15:22:10, with one isolated agent-browser 0.39.1 session (`gla115-ui-snapshot-7845ddba0ec6`). The browser was closed after the two page checks. The host browser version was not captured. These screenshots are short current-state observations, not evidence of stable behavior or a replacement for the detailed traces.

## Target identity

| UI | URL | Source branch/head at check | Source worktree | Served source observation |
|---|---|---|---|---|
| PHPantom | `http://127.0.0.1:7260/` | `gla-115-lsp-preview` / `863c1337adb05a339dbbd6eb20a9c26eb7b63316` | clean | Browser resource list included `/src/lsp/client.ts` and `/src/lsp/phpantom/worker.ts`; content hashes not collected. |
| Phpactor WIP | `http://127.0.0.1:3471/?v=8.5` (resolved to app URL with `v=8.5`) | `gla-115-lsp-phpactor-preview` / `3e9f56893ea5373b456b8fa12ede89fdc4b37776` | clean | Browser fetch readback: `/src/lsp/client.ts` HTTP 200, 77,536 bytes, SHA-256 `d0b419ace4749a8251db6449939cecd4ab5b1b0d6c4a5c42fd9416515aa08fc3`; `/src/lsp/phpactor/worker.ts` HTTP 200, 2,024 bytes, SHA-256 `1853ea78b3b5d60a452105cf8687c0fad16a433d54082448a403b6308a03fe34`. |

The Phpactor head was supplied by manager's #424 GitHub readback as a WIP publish, not a stable-fix declaration. The read-only worktree check during this run matched it and was clean. PHPantom remained on its previously accepted head.

## Common visible operation

The UI showed PHP 8.5; Completion was checked ON; HTML Preview was checked ON. The editor was initialized in the isolated page from the common `docs/lsp/ui-evaluation/fixture.php` contents using Monaco's model API, with a trailing newline. `str_` was then entered at the end via keyboard (`Meta+ArrowDown`, `keyboard type str_`); no Ctrl+Space was sent. The page was observed after a fixed 1.8-second display wait. This was not timed as a performance result, and the fixture setup itself was not natural typing.

The resulting editor text was the common fixture followed by a final `str_` line. Both pages showed a `Suggest` widget. PHPantom's visible list included `str_contains` and string functions such as `str_ends_with` and `str_replace`. Phpactor's selected row showed `str_contains` with `Function` detail and signature `str_contains(string $haystack, string $needle): bool`; other visible rows included `str_ends_with` and `str_replace`. No item count, raw Worker response, request/version/cursor correlation, timing, or provider attribution was recorded.

## Screenshots

- PHPantom: [phpantom.png](phpantom.png), captured immediately after its valid `str_` observation (around 15:20:51 UTC).
- Phpactor WIP: [phpactor.png](phpactor.png), captured immediately after its valid `str_` observation (around 15:21 UTC).

## Invalid and unverified

An earlier fixture setup in PHPantom left the original example text in the editor; it was discarded and is not represented by these screenshots. A later isolated Monaco `setValue` setup established the exact fixture before the valid observation. Phpactor had one clean setup and one observation.

This short check does not establish the 1.8-second automatic-completion acceptance criterion, performance, repeatability, stable behavior, candidate-set equivalence, or an origin for every visible row. It did not inspect errors, hover, version transitions, raw LSP responses, or physical paint timing. The displayed widget is a visual observation only.
