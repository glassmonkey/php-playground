# Excluded first-visible instrumentation run

This exploratory run is preserved but excluded from timing tables.

- The first `$greeter->` trial had matching full text/version/position.
- On later repetitions, the runner accepted an earlier `didChange` carrying the same text instead of requiring a post-input event. Those trials have no valid request/version correspondence.
- The per-case trace also contained cumulative records from both scenarios.

The corrected run requires event timestamps after each input and writes one case per trace: see `phpactor-first-visible-2026-10-25T13-26-48-949Z/` and `phpantom-first-visible-2026-10-25T13-26-59-591Z/`.
