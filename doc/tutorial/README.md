# PHP Tutorial

Use the project skill [`php-tutorial-authoring`](../../.agents/skills/php-tutorial-authoring/SKILL.md) for lesson design, version compatibility, official sources, and WASM evaluation. Reusable prompts live in that skill's `prompts/` directory.

## Versions and URLs

- Bundled PHP/WASM versions are listed in `src/tutorial/config.ts` (currently 5.6, 7.0–7.4, and 8.0–8.5).
- Fixed lessons use `/tutorial/<version>/<slug>`, for example `/tutorial/8.5/variables`.
- `/tutorial` and `/tutorial/latest` resolve in the SPA to the explicit `latestTutorialVersion`; the current value is 8.5. It does not advance automatically with the runtime list.
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
