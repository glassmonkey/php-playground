# PHP Tutorial

Choose the project skill for the requested task; each has its own prompt examples:

| Request | Entry point |
|---|---|
| Add/revise a lesson within the existing chapters | [php-tutorial-authoring](../../.agents/skills/php-tutorial-authoring/SKILL.md) |
| Design chapters, sequence, lesson splits or placement | [php-tutorial-curriculum](../../.agents/skills/php-tutorial-curriculum/SKILL.md) |
| Add PHP-version coverage, repair compatibility, or explicitly update latest | [php-tutorial-versioning](../../.agents/skills/php-tutorial-versioning/SKILL.md) |
| Review content/PR/references without editing | [php-tutorial-review](../../.agents/skills/php-tutorial-review/SKILL.md) |

Shared rules and task references live in [.agents/tutorial](../../.agents/tutorial/contract.md), accessible directly from every entry. Read only the references relevant to the request.

## Source files

- `src/tutorial/chapters.ts` and `reference-chapters.ts`: learner sequence and PHP Manual taxonomy.
- `src/tutorial/types.ts`, `content.ts`, and `config.ts`: lesson schema, per-version manifests, and supported versions.
- `src/tutorial/use-tutorial-runner.ts`: learner's manual PHP execution.
- `src/tutorial/authoring/assessment-harness.html`: development harness used by runtime tests; it is not a learner-facing route.
- `src/tutorial/learning-notes.ts`: version-resolved author/reviewer learning information.

## Checks and generated routes

Read [shared validation](../../.agents/tutorial/validation.md) for the existing UI/runtime suite and article HTML/SEO/OGP checks. Version routing and compatibility procedures are in [versioning](../../.agents/tutorial/versioning.md). These references do not require loading another skill entry point.
