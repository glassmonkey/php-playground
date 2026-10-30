# Add or update a PHP version

Use `$php-tutorial-authoring` to add `<version>` or revise its lesson coverage.

- Scope: `<new runtime / existing version; curriculum or lesson changes>`
- Latest change requested: `<yes / no>`

Read `tutorialVersions` and `latestTutorialVersion` from `src/tutorial/config.ts`, follow the runtime registry source, and read lesson availability from `lessonsByVersion` in `src/tutorial/content.ts`. Do not copy the current version list, count, or latest value into authoring guidance. Verify syntax gates against official PHP sources; validate the version-specific manifests and outputs on that exact WASM runtime. The curriculum is generated from the runtime list, so adding a runtime also generates its lessons, URLs and OGP assets. Before publishing, verify every generated lesson, feature gate and expected output on that exact WASM runtime, register the version's output fixtures, and check effects on existing versions; automatic generation does not establish compatibility. The latest selection does not advance automatically. Change `latestTutorialVersion` only when explicitly requested and after checking the target curriculum. Preserve existing fixed-version URLs.

Read `references/learning-design.md`. Update and review the version-resolved learning notes together with the lesson. Check structure/references, real WASM behavior, and educational meaning separately; do not infer semantic correctness from populated fields or output equality.
