# Learning intent and evaluation

## Connect explanations, execution, and evaluation through structured content

Read canonical types in `src/tutorial/types.ts`, resolved lessons in `lessonsByVersion`, and author notes in `src/tutorial/learning-notes.ts`. Do not duplicate the schema or current chapter/version/slug inventories here. `sections/blocks` define presentation; `programs` own executable code. Refer to the existing `goal` rather than copying it, and do not copy code or expected output into reasons.

Learning notes serve authors and reviewers. Explain why the Example behaves as it does; what an Experiment changes, what learners observe, and why; and the learner's likely misconception and its correction. Describe the relevant branches, values, or execution order instead of generic reasons such as “because PHP specifies it” or “to understand the goal.” Do not repeat learner-facing descriptions/prose verbatim; retain each field's distinct purpose. Displaying answers or reasons in the UI is a separate product decision.

Update source and learning notes together, then inspect the resolved content in every included version. If older versions replace a construct with different syntax, align the goal, prose, Example, Experiment, reasons, and references with that syntax. Do not redesign the entire resolver when the existing targeted compatibility adaptations suffice.

Check every syntax construct, function, and concept required by Example/Experiment executable code: teach it in that lesson's learner-facing prose or in an earlier lesson available in the same version. This also covers additions found only in code. Author-only explanations do not reach learners, and official reference links alone do not establish prior knowledge. A prerequisite slug's existence does not prove that no untaught concepts were introduced.

Even when adding a lesson without changing chapters, check `chapters.ts` boundaries and version-specific prior knowledge. For decisions that change chapter boundaries or learning order, use [curriculum design](curriculum.md).

## Validate in three stages

1. **Structure and references:** Use the canonical validator and unit tests to check required notes, program/goal references, and prerequisite order in each included version. Populated fields do not prove semantic correctness.
2. **Execution:** Reuse existing versioned Example/Experiment fixtures and actual WASM tests. Do not maintain separate code or expected output for the reasons. Matching execution does not establish that the explanations or goals are educationally sound.
3. **Semantics and teaching:** Compare resolved goals, prose, code, notes, actual results, and official sources in human or independent review. Check causal reasoning, version differences, misconception corrections, and prerequisites. Do not present unchecked versions or source content as verified.

When evaluating an authoring skill, record a real addition/revision task and its artifacts, then assess them through these stages. Instructions being present or existing content passing static review does not guarantee future generation performance.
