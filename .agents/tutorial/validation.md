# Validation and generated assets

Select checks according to the change or review scope. A read-only reviewer may run existing checks and inspect evidence, but must report proposed content, fixture, or checker changes rather than modifying or regenerating them.

1. Structure/references: use `validateLesson` / `validateLessons` and unit tests to check required fields, Program/goal references, and prerequisite order in each included version.
2. Execution: run the Example and every Experiment in the target WASM version and compare them with that version's values in `src/tutorial/authoring/fixtures/example-outputs.json` / `experiment-outputs.json`. Do not copy or infer expected values across versions. A fixture's `cliVersion` identifies the initial CLI version, not each entry's provenance or educational validity. Distinguish parity between runtimes executing the same code from semantic correctness.
3. Semantics/teaching: compare resolved goals, prose, code, learning notes, actual results, and official sources for prerequisites and causal explanations. Do not present unchecked versions or behavior as verified. See [learning design](learning-design.md).

Use the application's existing Playwright/Vite configuration; do not add a separate build root or validation Vite server. Select the relevant targets:

```sh
npm run test:ci
npm run test:e2e -- e2e/tutorial.spec.ts
npm run test:e2e -- e2e/tutorial-runtime.spec.ts
npm run build
```

PNG decoding checks use Chromium from the existing Playwright dependency, independently of the renderer. Install it with `npx playwright install chromium`; the unit CI job installs the browser and required OS libraries. Decoding/dimensions do not prove layout or literal-text correctness; record reviewed visual evidence separately.

UI checks cover Example/Experiment selection, drafts/input, manual Run, output clearing, version switching, and recovery. Runtime checks cover Examples/Experiments and solutions/checkers on each target version. Only when handling checkers or cases, add the negative controls and syntax compatibility checks from [exercise evaluation](exercise-evaluation.md).

## SEO/OGP for lesson and version additions

The normal `npm run build` also verifies generated canonical pages, compiled-asset/image references, per-runtime curriculum presence, and aliases against the explicitly configured latest. It does not use a separate build unit test or require a browser.

Using `lessonsByVersion` as the source, the normal `npm run build` generates fixed-version HTML, canonical URLs, sitemap, and OGP PNGs through `seo-build.ts` in the same public directory. Do not hand-edit the sitemap or create separate lesson JSON for images. Match each article's preferred URL, HTML canonical, and sitemap entry; exclude unsupported versions and latest aliases from the sitemap. `/tutorial/` and `/tutorial/latest/` redirect to the explicitly selected fixed version.

`og-image.ts` renders titles, Example code, and PHP versions. Verify that HTML og:image/twitter:image point to the generated PNGs, inspect long-text/code wrapping and truncation, and check bundled fonts/licenses. Do not depend on external font downloads or OS fonts. Ensure the authoring HTML harness still works.

Report affected versions/slugs, primary sources, executed checks/results, semantic review, and unverified scope. Evaluate skill generation performance separately with actual tasks and artifacts; do not claim performance improvement from document reorganization or successful content review alone.
