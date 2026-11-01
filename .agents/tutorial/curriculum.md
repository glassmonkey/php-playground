# Curriculum design

Use these criteria for chapter additions, learning-order changes, lesson splits, or relocation. An ordinary lesson addition within existing boundaries uses the criteria in `chapters.ts`; it does not require chapter redesign.

## Decision inputs and deliverables

Resolve target versions' `lessonsByVersion` through `groupLessons` and inspect each chapter's included/excluded scope, assumptions, and subsequent learning. Code owns the actual chapter/slug/version inventories. Read [specification mapping](language-reference-map.md) only when comparing learning chapters with PHP specification categories.

For each addition, split, or relocation option, identify:

- What learners already know, what they can do afterward, and how the Example/Experiments demonstrate it.
- Whether it fits an existing chapter; if a new chapter is needed, what it includes/excludes. Do not use vague Projects or Supplemental chapters as catch-all categories.
- Untaught syntax, dependencies on version-limited lessons that would break older versions, and prerequisite order in each version.
- For an overloaded lesson, the responsibilities after splitting, moved prerequisites, and preservation of existing URLs or explicit destinations/redirects.

Do not change placement just for visual organization. Explain alternatives, tradeoffs, and changes within the requested implementation scope. A design-only request does not authorize chapter or URL changes. When implementation is requested, update catalogs, lesson dependencies, required version-specific notes/prose, and routes together, then check structure, WASM behavior, meaning, and assets for all affected versions using [validation](validation.md).

Complete the task when chapter boundaries, prerequisites, subsequent learning, and URL effects are explained, and the requested implementation scope and checks are complete. Do not automatically change latest as part of learning-order design.
