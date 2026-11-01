---
name: php-tutorial-review
description: Review PHP tutorial PRs, content and reference consistency read-only; report evidence-based findings about goals, prerequisites, versions, sources and runtime verification. Do not implement fixes implicitly.
---

# Review content without editing

Use this skill for requests such as “review this tutorial PR” or “check that the explanations match their references.” It returns evidence-based feedback.

Inspect content, code, references, and verification evidence read-only, and return findings and recommended corrections. Do not edit content/fixtures/configuration, rewrite solutions, commit, or push. If the user explicitly changes the role to implementation, establish the scope as the corresponding production task.

## Workflow

Read the [shared contract](../../tutorial/contract.md) and [review criteria](../../tutorial/review.md). Follow their links only for details relevant to the diff; do not load all authoring, versioning, and curriculum SKILL.md files.

## Deliverables and completion

Deliver findings with severity, affected location/version, evidence, impact, and recommended correction. Complete the review by distinguishing confirmed findings from unverified candidates and stating the checked scope and unperformed work. If there are no concrete findings, say so; implementing corrections is not a review completion condition. Evaluating skill generation performance is a separate task.

Use the [review prompt](prompts/review.md) for request examples. Only when switching to another task, select its skill from the [entry-point list](../../../doc/tutorial/README.md).
