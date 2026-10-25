# Excluded hover harness development run

This exploratory trace is preserved but excluded from hover conclusions. Its pointer action did send a hover request and later showed a tooltip, but the runner inspected the Worker event list before waiting for the request. Its keyboard chord used `Control+K`, which edited the document in this Mac Monaco context. The corrected run waits for the request, uses `Meta+K` then `Meta+I`, resets the same fixture between operations, and records visible hover DOM: `phpactor-hover-2026-10-25T13-17-20-597Z/` and `phpantom-hover-2026-10-25T13-17-33-198Z/`.
