# Add or update a PHP version

Use `$php-tutorial-authoring` to add `<version>` or revise its lesson coverage.

- Scope: `<new runtime / existing version; curriculum or lesson changes>`
- Latest change requested: `<yes / no>`

Read the supported runtime list from `src/tutorial/config.ts`. Verify syntax gates against official PHP sources; validate the version-specific manifests and outputs on that exact WASM runtime. Runtime support alone does not add lessons or advance latest. Change `latestTutorialVersion` only when explicitly requested and after checking the target curriculum. Preserve existing fixed-version URLs.
