---
name: php-tutorial-versioning
description: Adapt PHP tutorial content to a new PHP version or fix compatibility in existing versions; update latest only when requested. Use for curriculum compatibility, not automatic runtime infrastructure changes.
---

# Support PHP versions

Use this skill for requests such as “support the new PHP version,” “repair compatibility with an older version,” or “update latest after verification.” It covers version-specific availability and behavior.

Check and revise lesson availability, syntax, explanations/learning notes, expected output, and effects on existing versions. Do not automatically expand a content-compatibility request into runtime infrastructure changes. Handle a latest update only when explicitly requested.

## Workflow

Read the [shared contract](../../tutorial/contract.md), [versioning](../../tutorial/versioning.md), and [validation](../../tutorial/validation.md). Read [learning design](../../tutorial/learning-design.md) when revising learning notes and [exercise evaluation](../../tutorial/exercise-evaluation.md) when changing checkers.

## Deliverables and completion

Deliver availability/compatibility changes, resolved explanations/code/notes, per-version fixtures, and evidence for existing-version checks. Complete the task when every generated lesson for the target version and the required assets have been checked, and the report states whether latest changed and which infrastructure or behavior remains unavailable/unverified.

Use the [version prompt](prompts/update-version.md) for request examples. Only when switching to another task, select its skill from the [entry-point list](../../../doc/tutorial/README.md).
