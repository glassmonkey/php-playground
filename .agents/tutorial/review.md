# Content review criteria

Inspect the PR, content, and references after resolving the target versions. Return evidence and recommendations without implementing corrections. Run existing checks or inspect their results; do not modify content, fixtures, or configuration.

- Can learners observe the goal in the visible Example/Experiments? Populated learning notes still require semantic review. Use [learning design](learning-design.md).
- Do prerequisites exist earlier in the displayed order for that version? Apply the shared prior-knowledge rules in [learning design](learning-design.md) to learner-facing Experiment prerequisites. Read [curriculum design](curriculum.md) only when the diff includes chapter/sequence decisions.
- Do reference labels, actual topics, claims, and introduction versions agree? HTTP 200 or matching taxonomy alone is insufficient. Use [specification mapping](language-reference-map.md).
- For compatibility adaptations, use [versioning](versioning.md) to compare the meaning of prose, code, reasons, and checkers.
- Distinguish structural, actual WASM, and semantic evidence using [validation](validation.md). Inspect [exercise evaluation](exercise-evaluation.md) negative controls only for checker changes. Do not report unperformed checks as successful.

For each finding, provide severity, file/location, target version, reproduction or evidence, learner/content impact, and recommended correction. Distinguish confirmed defects from design proposals and unverified candidates. If there are no concrete findings, state that along with the checked scope. Do not confuse content review with an experiment measuring skill generation performance.
