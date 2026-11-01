# Reviewed OGP visual baselines

These 24 baseline images were visually reviewed by the parent and the read-only Astra reviewer against the approved “Learn PHP by doing” design before use as regression expectations. The review checked each version badge, the index title and greeting Example, and the Variables title and price Example. Review sheets and edge-case observations are recorded in the external per-version verification report.

Tests compare complete decoded dimensions and RGBA pixels using the browser decoder. They do not snapshot compressed PNG bytes or automatically accept renderer output. Any baseline replacement requires reviewing the intended content/layout change; do not regenerate and bless it merely to make a failing test pass.

Coverage is these index/Variables images for the explicit version contract, not every title or arbitrary code. The long-title and special-character samples were separately inspected for this revision; their decoding tests alone do not prove text placement or literal rendering.
