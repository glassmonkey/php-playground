# Add or update a PHP version

Use `$php-tutorial-authoring` to add `<version>` or revise its lesson coverage.

- Scope: `<new runtime / existing version; curriculum or lesson changes>`
- Latest change requested: `<yes / no>`

Read the supported runtime list from `src/tutorial/config.ts`. Verify syntax gates against official PHP sources; validate the version-specific manifests and outputs on that exact WASM runtime. The curriculum is generated from the runtime list, so adding a runtime also generates its lessons, URLs and OGP assets. Before publishing, verify every generated lesson, feature gate and expected output on that exact WASM runtime; automatic generation does not establish compatibility. The latest selection does not advance automatically. Change `latestTutorialVersion` only when explicitly requested and after checking the target curriculum. Preserve existing fixed-version URLs.
