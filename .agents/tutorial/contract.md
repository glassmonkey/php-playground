# Shared PHP tutorial contract

This document is the canonical shared rule set directly referenced by the four tutorial skills. Read only the details needed for the task; another task's SKILL.md is not the gateway to shared knowledge. A skill's scope and read-only instructions take precedence over repair examples in shared procedures.

## Sources of truth and execution environment

- The schema and Program contract are in `src/tutorial/types.ts`, structural validation in `validate-content.ts`, resolved lessons in `content.ts` (`lessonsByVersion`), and author learning notes in `learning-notes.ts`.
- Learning chapter order and boundaries are in `chapters.ts`; specification categories are in `reference-chapters.ts`. Resolve display order with `groupLessons`. Read [specification mapping](language-reference-map.md) when comparing these classifications.
- Supported versions and the explicit latest selection are defined by `tutorialVersions` / `latestTutorialVersion` in `config.ts` and its runtime registry source. Do not duplicate the schema, current chapter/slug/version inventories, version counts, or the latest value in documentation.
- Lessons run PHP/WASM inside the browser. The project does not provide HTTP servers, databases, Composer, or framework operations/security environments; do not imply that support or coverage. Additional infrastructure needs its own design within the requested scope, rather than following automatically from a lesson request.

## Content invariants

Write repository instructions and learner-facing content in English. Use the existing sections/blocks presentation and shared programs; do not create per-lesson JSX branches or separate copies of code and expected output. Check goals, changes/observations/reasons, and misconceptions using [learning design](learning-design.md). Reasons are author/reviewer information; adding them does not authorize learner-facing answer displays.

Example and Experiment are siblings. Selection switches code/input/draft and clears output; execution starts only after Run. Show output in one lab, without handwritten fixed output in the prose. Set Program.input only when the code reads `$input`. Evaluate grading through the author-only harness; do not add a learner-facing Check operation.

Use the official PHP Manual/release notes as primary sources for PHP behavior and feature introduction. Store links that directly support claims in each Lesson's references. A link's existence or chapter classification does not establish semantic agreement. Review resolved prose, Example/Experiment code, goals, learning notes, and sources together.

Use book tables of contents only as input for topic/prerequisite discussions; do not copy their chapter structure, order, headings, prose, or examples. Independently design the sequence even when consulting the publisher's official table of contents for [Dokushu PHP, 4th edition (独習PHP 第4版)](https://www.shoeisha.co.jp/book/detail/9784798168494).

## Verification and published assets

Separate structural/reference checks, actual WASM execution, and semantic/educational review. Read [validation and generated assets](validation.md) for commands, fixture limitations, and SEO/OGP checks. Runnable code and populated learning notes do not guarantee semantic correctness.

Preserve existing fixed-version URLs. Change latest only after an explicit request and verification of the target curriculum. A content-compatibility request does not automatically authorize runtime infrastructure changes. Detailed procedures are centralized in [versioning](versioning.md).
