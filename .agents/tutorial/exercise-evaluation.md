# Exercise evaluation and incorrect-answer detection

The executable contract is defined by `src/tutorial/types.ts`, `src/tutorial/content.ts`, and the actual evaluation code under `src/tutorial`. This document describes design and validation, not another schema. If it differs from current types or execution paths, treat code as authoritative and update the guidance within the task's editing scope.

Reference the solution through the program registry's `solutionProgramId`, using the same code as the program checked by the grader. Do not duplicate solution strings for checkers. Learners manually run Examples/Experiments; grading results belong to the author-only harness.

## Case design

For functions or transformations that depend on input, use multiple JSON inputs to detect hard-coded answers. For input-independent tasks such as printing fixed text, do not add meaningless cases. Give each case a short, understandable label relating its input to its evaluation intent.

- Include ordinary input and at least one different value to detect hard-coded responses.
- Include boundaries or empty values relevant to the goal; do not grade untaught constraints or undefined behavior.
- Add invalid-input cases only when handling that input is part of the lesson.
- Confirm that each case runs independently, without state or variables from earlier cases.

Treat `checkPhp` as a complete PHP file. Use the contract's `$input`, string `$output`, and `$returnValue` to return the result array. Learner PHP and its checker run within the same target-version WASM request; each case has an independent request, so a checker cannot inherit state from earlier cases. Checker PHP must parse and execute in every included version. For example, `mixed` is unavailable before PHP 8.0. Use compatible syntax or version-specific metadata. Consult the types and execution code for argument names/types and result shape rather than extending a copied contract here.

Grade observable behavior taught by the exercise. Compare complete output and newlines when output is the target, and returned values when those are the target. If execution cannot distinguish a class-design requirement, reconsider the implementation requirement or provide an explicit observation method. Solution-string equality and searches for particular variable names or code fragments are not substitutes for behavioral evaluation.

## WASM verification

Run the learner program and checker together for every case in the actual target PHP WASM worker. Checkers are PHP files too. Derive targets from `tutorialVersions` in `src/tutorial/config.ts` and `lessonsByVersion` in `src/tutorial/content.ts`; check parsing, JSON decoding, types, and exceptions in each included version. Ensure newly added versions are covered.

The learner UI supports editing and manual execution, not case pass/fail results. The harness at `src/tutorial/authoring/assessment-harness.html` uses the real `src/tutorial/assessment-worker.ts`; `e2e/tutorial-runtime.spec.ts` runs it. The harness is not a learner-facing route.

Run all registered solutions and cases across configured target versions:

```sh
npm run test:e2e -- e2e/tutorial-runtime.spec.ts --grep 'runs every registered lesson solution'
```

Check negative controls, syntax/exit/empty-output behavior, and recovery after worker stop or harness timeout:

```sh
npm run test:e2e -- e2e/tutorial-runtime.spec.ts --grep 'detects hard-coded|negative control|PHP errors|stop or time out'
```

Run the complete existing Playwright suite, including runtime authoring checks:

```sh
npm run test:e2e
```

Runtime checks share the application's Playwright configuration and Vite server; there is no separate authoring server or package script. Harness stop/timeout cases terminate the test worker and do not establish a production UI timeout contract. Learner navigation/editing is covered by `e2e/tutorial.spec.ts`; programs/checkers by `e2e/tutorial-runtime.spec.ts`. Focus CLI parity checks with `npm run test:e2e -- e2e/tutorial-runtime.spec.ts --grep 'registered Experiment Program against CLI/WASM output baselines'`. Baselines execute the same registry code in another runtime; they are not independently defined semantic expectations.

## Negative controls

A passing solution alone does not show that a checker distinguishes incorrect behavior. Deliberately violate individual requirements and run those incorrect programs against all cases in the target WASM version.

Examples:

- Extra output must not pass because the checker uses substring matching.
- A hard-coded result for one input must not pass other inputs.
- An off-by-one boundary error must not pass.
- A wrong return value must fail when that value is graded, even if displayed output matches.
- Shared state must not turn an expected failure into a pass in another case.

If an incorrect program passes the case corresponding to its violated requirement, the checker is not detecting that error. A hard-coded name may pass a case asking for that name, but must not also pass cases asking for other names. An author should correct the checker or task and rerun both valid solutions and relevant negative controls; a read-only reviewer reports the correction instead. Label uncovered behavior as unverified.
