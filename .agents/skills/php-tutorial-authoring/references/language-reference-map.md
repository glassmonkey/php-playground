# Learning chapters and PHP specification references

There are two separate catalogs:

- `src/tutorial/chapters.ts` defines the learner-facing sequence and chapter IDs. `groupLessons` uses this order for index and syllabus; lesson order within each chapter follows the version manifest.
- `src/tutorial/reference-chapters.ts` defines the PHP Manual taxonomy used for specification mapping. Each Lesson has a `referenceChapterId`; official PHP documentation remains the authority for claims about PHP behavior and version support.

The publisher's official [『独習PHP 第4版』 table of contents](https://www.shoeisha.co.jp/book/detail/9784798168494) can inform discussion of pacing and prerequisites. Design the learning sequence independently; do not reproduce the book's headings, order, prose, or examples. Keep the PHP Manual taxonomy separate to make each topic's specification source clear.

## Resolve the learning sequence and reference mapping

For the version under review, read `lessonsByVersion[version]` from `src/tutorial/content.ts` and apply `groupLessons` from `src/tutorial/chapters.ts` to obtain the displayed chapter and lesson order. Resolve each lesson's `referenceChapterId` through `src/tutorial/reference-chapters.ts`. Do not duplicate the chapter, slug, or coverage lists here.

Keep a Lesson's `referenceChapterId` aligned with the official subject it teaches, even when its learner-facing `chapterId` groups it with prerequisite or follow-up material. Confirm the specific claim against the direct official references on the Lesson; a chapter-level mapping alone is not evidence for every claim.

Derive uncovered reference categories by comparing the catalogs with the selected version's lessons. A missing lesson does not establish that PHP/WASM cannot run the feature, and a linked reference chapter does not establish complete coverage of that chapter.

## Runtime and feature compatibility

Read `tutorialVersions` in `src/tutorial/config.ts` and its runtime registry source for the supported playground targets. This list does not claim upstream PHP support or include every PHP version ever released. `lessonsByVersion` generates a curriculum from that list, with feature gates and source adaptations. Adding a runtime therefore also generates lesson routes and assets; verify compatibility and output fixtures for that version before publishing.

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

## Scope and sequencing rationale

The current product runs PHP in a browser-based WebAssembly playground. Lessons therefore prioritize code learners can edit, run, and compare inside that environment. Server request lifecycle, database access, Composer workflows, and application security depend on server-side runtime, infrastructure, external dependencies, or threat-model context that this playground does not currently provide. They are deferred until the project can implement and verify that support. Do not suggest that browser output exercises teach those operational topics, and do not create a vague “Projects” or “Supplemental” chapter to hold them.

When considering another topic, identify its prerequisites and what the learner should be able to predict or do afterward. Place it in an existing learning chapter if the progression still makes sense; otherwise propose a narrowly named chapter with an explicit purpose. Check the rendered order using `groupLessons`, not the raw global manifest order. Update the relevant catalogs and lesson references when IDs or coverage change.

## Authoring check

Before registering a Lesson:

1. Choose `chapterId` for its place in the learner's progression.
2. Choose `referenceChapterId` for the relevant PHP Manual taxonomy; these IDs serve different purposes.
3. Link direct official pages that support the PHP claims and version differences in the Lesson.
4. Confirm the Example and Experiments demonstrate the visible goal, explain advanced additions or teach them earlier, and use `Program.input` only when the code reads `$input`.
5. Check `groupLessons` and the version manifest to verify chapter placement and within-chapter order.
6. Describe coverage narrowly. A chapter mapping does not mean the lesson covers that entire official Manual chapter.
