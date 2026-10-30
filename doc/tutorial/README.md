# PHP Tutorial

Use the project skill [`php-tutorial-authoring`](../../.agents/skills/php-tutorial-authoring/SKILL.md) for lesson design, version compatibility, official sources, and WASM evaluation. Reusable prompts live in that skill's `prompts/` directory.

## Versions and URLs

- Read supported PHP/WASM versions from `tutorialVersions` in `src/tutorial/config.ts` and its runtime registry source. Read lesson availability from `lessonsByVersion` in `src/tutorial/content.ts`.
- Fixed lessons use `/tutorial/<version>/<slug>/`.
- `/tutorial/` and `/tutorial/latest/` redirect to the version explicitly selected by `latestTutorialVersion` in `src/tutorial/config.ts`. It does not advance automatically with the runtime list.
- Adding a runtime also generates its curriculum, URLs, and OGP assets. Verify that version's lessons, feature gates, and output fixtures before publishing; generation alone does not establish compatibility.
- Updating latest does not redirect fixed-version URLs.

## Source files

- `src/tutorial/chapters.ts` and `reference-chapters.ts`: learner sequence and PHP Manual taxonomy.
- `src/tutorial/types.ts`, `content.ts`, and `config.ts`: lesson schema, per-version manifests, and supported versions.
- `src/tutorial/use-tutorial-runner.ts`: learner's manual PHP execution.
- `src/tutorial/authoring/assessment-harness.html`: development harness used by runtime tests; it is not a learner-facing route.
- `doc/tutorial/drafts/<version>/<slug>.md`: working drafts.

## Checks

```sh
npm run test:e2e -- e2e/tutorial.spec.ts
npm run test:e2e -- e2e/tutorial-runtime.spec.ts
npm run test:e2e
```

The first command covers learner behavior, the second runs examples, experiments, and exercise checkers on configured PHP/WASM versions, and the last runs the complete existing Playwright suite. See the skill for focused filters and review requirements.
