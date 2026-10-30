# PHP version compatibility

Use `config.ts` and its runtime registry source for supported versions and the selected latest, `content.ts` for lesson availability/adaptations, and `learning-notes.ts` for author notes. Do not automatically expand a content-support request into runtime loader, WASM build, or distribution infrastructure work. If the target runtime is unavailable, report the required infrastructure and unverified scope.

## Procedure

1. Confirm introduced/changed behavior against the official PHP Manual/release notes, then determine availability and direct lesson references. Read [specification mapping](language-reference-map.md) when needed.
2. Compare version-resolved prose, goals, Examples/Experiments, reasons/misconceptions, prerequisites, and exercises/checkers. Check whether shared additions change the meaning for older versions. Do not redesign the entire resolver when targeted adaptations suffice.
3. The runtime list also generates curricula. Before publishing a newly added runtime, verify all generated lessons and feature gates for that version. Generation alone is not compatibility evidence. Check per-version expected output in actual WASM, register fixtures, and check existing versions for regressions. Use [validation](validation.md), adding [exercise evaluation](exercise-evaluation.md) when changing checkers.
4. Only after an explicit latest-update request and full target-curriculum verification, update `latestTutorialVersion`. Do not redirect fixed-version URLs to latest; verify generated HTML, sitemap, OGP, and aliases.

The following are stable feature-introduction examples, not the current supported-version inventory or a complete feature-gate list.

| Feature | First PHP version | Authoring rule | Official source |
|---|---:|---|---|
| Scalar parameter types and return types | 7.0 | For PHP 5.6, use untyped signatures and explain the version difference when relevant. | [PHP 7.0 new features](https://www.php.net/manual/en/migration70.new-features.php) |
| `intdiv()` | 7.0 | Use compatible arithmetic in PHP 5.6 programs, or omit the call from that version's variant. | [`intdiv()`](https://www.php.net/manual/en/function.intdiv.php) |
| `void` return type and nullable types | 7.1 | Do not put these declarations in PHP 5.6 or 7.0 program variants. | [Type declarations](https://www.php.net/manual/en/language.types.declarations.php) |
| Typed class properties | 7.4 | Use an untyped property or a version-specific lesson/program before 7.4. | [Properties](https://www.php.net/manual/en/language.oop5.properties.php) |
| `mixed` type and `match` expression | 8.0 | Keep them out of all 5.6/7.x sources. Because checker PHP is parsed by the selected runtime too, checker files must also avoid newer syntax when testing older versions. | [Type declarations](https://www.php.net/manual/en/language.types.declarations.php), [`match`](https://www.php.net/manual/en/control-structures.match.php) |
| Enums | 8.1 | Include enum lessons only in manifests for PHP 8.1 and later. | [Enums overview](https://www.php.net/manual/en/language.enumerations.overview.php) |
| Property hooks | 8.4 | Include hook lessons only in manifests for PHP 8.4 and later. | [Property Hooks](https://www.php.net/manual/en/language.oop5.property-hooks.php) |

This table is a minimum source review, not a promise that any lesson using a listed feature has already been independently audited. Before adding a syntax construct, function, or behavior, verify its introduction/availability on the official page and run the exact Example, Experiment, solution, and checker on every version that includes it.

For extension functions, verify that the extension is enabled in each target PHP/WASM runtime as well as checking the PHP Manual page. A function appearing in the official library reference does not by itself prove the playground build includes its extension.

The output fixtures are keyed by PHP version. Keep `versions[version]` metadata for every registered program and experiment; do not fill one version's output by copying another version's output or from the CLI version label. Run each program on the selected WASM runtime and compare with the stored value for that same version. If an output differs by version, retain separate expected strings. CLI output baselines identify their origin version, but their entries do not carry full provenance and do not independently prove semantic correctness.

Read the selected latest version from `latestTutorialVersion` in `src/tutorial/config.ts`. This is an explicit curriculum choice, not an inference from the newest or oldest bundled runtime. Change it only when explicitly requested and after the full lesson set for that target has been reviewed and run.

Complete the task when availability, syntax, explanations/notes, expected output, checkers, and existing-version effects have been checked on the target runtime, and the report identifies unavailable/unverified scope and whether latest changed.
