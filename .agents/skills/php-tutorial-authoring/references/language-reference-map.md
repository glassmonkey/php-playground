# Learning chapters and PHP specification references

There are two separate catalogs:

- `src/tutorial/chapters.ts` defines the learner-facing sequence and chapter IDs. `groupLessons` uses this order for index and syllabus; lesson order within each chapter follows the version manifest.
- `src/tutorial/reference-chapters.ts` defines the PHP Manual taxonomy used for specification mapping. Each Lesson has a `referenceChapterId`; official PHP documentation remains the authority for claims about PHP behavior and version support.

The publisher's official [『独習PHP 第4版』 table of contents](https://www.shoeisha.co.jp/book/detail/9784798168494) informed discussion of pacing and prerequisites. The learning sequence below is our own instructional design. It does not reproduce the book's headings, order, prose, or examples. The official PHP Manual taxonomy is retained separately to make each topic's specification source clear.

## Current learning sequence and reference mapping

| Learner-facing chapter | `chapterId` | Lesson slugs, in intended order | PHP Manual reference chapters used |
|---|---|---|---|
| Run your first script | `getting-started` | `output` | [Basic syntax](https://www.php.net/manual/en/language.basic-syntax.php) |
| Store and inspect data | `working-with-values` | `variables`, `types`, `constants`, `arrays` | [Variables](https://www.php.net/manual/en/language.variables.php), [Types](https://www.php.net/manual/en/language.types.php), [Constants](https://www.php.net/manual/en/language.constants.php) |
| Calculate and compare | `calculations` | `operators`, `expressions` | [Operators](https://www.php.net/manual/en/language.operators.php), [Expressions](https://www.php.net/manual/en/language.expressions.php) |
| Choose paths and repeat steps | `decisions-and-loops` | `conditionals`, `loops` | [Control Structures](https://www.php.net/manual/en/language.control-structures.php) |
| Use and write functions | `using-functions` | `string-functions`, `functions`, `format-full-name` | [String Functions](https://www.php.net/manual/en/ref.strings.php), [Functions](https://www.php.net/manual/en/language.functions.php) |
| Model data with objects | `objects-and-state` | `classes`, `enums`, `property-hooks` (8.4+) | [Classes and Objects](https://www.php.net/manual/en/language.oop5.php), [Enumerations](https://www.php.net/manual/en/language.enumerations.php) |
| Respond to failures | `handling-failures` | `errors` | [Error Handling](https://www.php.net/manual/en/language.error-handling.php) |

This is a selected beginner sequence, not complete coverage of the listed PHP Manual chapters. Keep a Lesson's `referenceChapterId` aligned with the official subject it teaches, even when its learner-facing `chapterId` groups it with prerequisite or follow-up material. Confirm the specific claim against the direct official references on the Lesson; a chapter-level mapping alone is not evidence for every claim.

Other current `reference-chapters.ts` entries without a lesson include Namespaces, Fibers, Generators, Attributes, References Explained, and Predefined Variables. They are outside this selected sequence for now; their absence is not a claim that PHP/WASM cannot run every related language feature.

## Runtime and feature compatibility

The bundled runtime list is explicit in `src/tutorial/config.ts`: PHP 5.6, 7.0, 7.1, 7.2, 7.3, 7.4, and 8.0–8.5. These are all supported playground targets; “supported” here refers to this bundled runtime list, not every PHP version ever released. The UI curriculum may intentionally include different lessons or program syntax per version. Do not assume that registering a runtime automatically means every lesson is available there.

| Feature in current lessons/checkers | First PHP version | Authoring rule | Official source |
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

`latestTutorialVersion` currently remains 8.5 by explicit configuration. This is a curriculum choice, not an inference from the newest or oldest bundled runtime. Advance it only when explicitly requested and after the full lesson set for that target has been reviewed and run.

## Scope and sequencing rationale

The current product runs PHP in a browser-based WebAssembly playground. Lessons therefore prioritize code learners can edit, run, and compare inside that environment. Server request lifecycle, database access, Composer workflows, and application security depend on server-side runtime, infrastructure, external dependencies, or threat-model context that this playground does not currently provide. They are deferred until the project can implement and verify that support. Do not suggest that browser output exercises teach those operational topics, and do not create a vague “Projects” or “Supplemental” chapter to hold them.

When considering another topic, identify its prerequisites and what the learner should be able to predict or do afterward. Place it in an existing learning chapter if the progression still makes sense; otherwise propose a narrowly named chapter with an explicit purpose. Check the rendered order using `groupLessons`, not the raw global manifest order. Update both catalogs and this mapping together when IDs or coverage change.

## Authoring check

Before registering a Lesson:

1. Choose `chapterId` for its place in the learner's progression.
2. Choose `referenceChapterId` for the relevant PHP Manual taxonomy; these IDs serve different purposes.
3. Link direct official pages that support the PHP claims and version differences in the Lesson.
4. Confirm the Example and Experiments demonstrate the visible goal, explain advanced additions or teach them earlier, and use `Program.input` only when the code reads `$input`.
5. Check `groupLessons` and the version manifest to verify chapter placement and within-chapter order.
6. Describe coverage narrowly. A chapter mapping does not mean the lesson covers that entire official Manual chapter.
