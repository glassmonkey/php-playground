# Exploratory run, excluded

The browser showed rows for some cases, but the runner calculated the expected Monaco line as 8 instead of the observed 0-based line 7. As a result, it failed to associate the current-version request/response. It also sampled after a fixed wait that ended before the slow Phpactor response completed. Keep the screenshots and trace as exploratory evidence only; use the line-corrected runs instead.
