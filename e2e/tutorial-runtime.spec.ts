import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { lessonsByVersion } from '../src/tutorial/content';
import { tutorialVersions } from '../src/tutorial/config';
import {
	validateLesson,
	validateLessons,
} from '../src/tutorial/validate-content';
import type { AssessmentResponse } from '../src/tutorial/assessment-worker';
import type { Lesson, ExerciseCase, JSONValue } from '../src/tutorial/types';

const HARNESS = '/src/tutorial/authoring/assessment-harness.html';
const experimentOutputBaseline = JSON.parse(
	readFileSync(
		'src/tutorial/authoring/fixtures/experiment-outputs.json',
		'utf8'
	)
) as {
	versions: Record<string, Record<string, Record<string, string>>>;
};
const exampleOutputBaseline = JSON.parse(
	readFileSync('src/tutorial/authoring/fixtures/example-outputs.json', 'utf8')
) as {
	versions: Record<string, Record<string, string>>;
};
const lessonFor = (version: (typeof tutorialVersions)[number], slug: string) =>
	lessonsByVersion[version].find((lesson) => lesson.slug === slug)!;

type HarnessState =
	| { status: 'running' }
	| { status: 'complete'; response: AssessmentResponse }
	| { status: 'error'; message: string }
	| { status: 'stopped' }
	| { status: 'timeout' };

declare global {
	interface Window {
		tutorialWasmHarness: {
			start(input: {
				version: (typeof tutorialVersions)[number];
				code: string;
				cases?: ExerciseCase[];
				runInput?: Lesson['programs'][string]['input'];
			}): string;
			read(id: string): HarnessState | undefined;
			stop(id: string): void;
		};
	}
}

async function waitForState(page: Page, id: string, timeout = 10_000) {
	await page.waitForFunction(
		(runId) => {
			const state = window.tutorialWasmHarness.read(runId);
			return state !== undefined && state.status !== 'running';
		},
		id,
		{ timeout }
	);
	return page.evaluate((runId) => window.tutorialWasmHarness.read(runId), id);
}

async function startCheck(
	page: Page,
	version: (typeof tutorialVersions)[number],
	code: string,
	cases: ExerciseCase[]
) {
	const id = await page.evaluate(
		(input) => window.tutorialWasmHarness.start(input),
		{ version, code, cases }
	);
	const state = await waitForState(page, id);
	expect(state?.status).toBe('complete');
	if (state?.status !== 'complete')
		throw new Error(
			`Expected a completed assessment, got ${state?.status}.`
		);
	return state.response;
}

async function expectStatuses(
	page: Page,
	version: (typeof tutorialVersions)[number],
	lesson: Lesson,
	code: string,
	want: readonly ('passed' | 'failed' | 'error')[]
) {
	const response = await startCheck(
		page,
		version,
		code,
		lesson.exercise.cases
	);
	expect(response.error).toBeUndefined();
	expect(response.results.map((result) => result.id)).toEqual(
		lesson.exercise.cases.map((testCase) => testCase.id)
	);
	expect(response.results.map((result) => result.status)).toEqual(want);
	return response;
}

async function runProgram(
	page: Page,
	version: (typeof tutorialVersions)[number],
	code: string,
	input: JSONValue
) {
	const id = await page.evaluate(
		(request) => window.tutorialWasmHarness.start(request),
		{ version, code, runInput: input }
	);
	const state = await waitForState(page, id);
	expect(state?.status).toBe('complete');
	if (state?.status !== 'complete')
		throw new Error(`Expected a completed PHP run, got ${state?.status}.`);
	expect(state.response.error).toBeUndefined();
	return state.response.output;
}

test.beforeEach(async ({ page }) => {
	await page.goto(HARNESS);
	await expect(
		page.getByRole('heading', {
			name: 'Tutorial authoring runtime harness',
		})
	).toBeVisible();
});

test('validates each manifest and rejects malformed authoring fixtures', async () => {
	for (const version of tutorialVersions)
		expect(validateLessons(lessonsByVersion[version])).toEqual([]);

	const template = lessonFor('8.5', 'output');
	const missingProgram = structuredClone(template);
	missingProgram.sampleProgramId = 'missing';
	const unsupportedBlock = structuredClone(template);
	unsupportedBlock.sections[0].blocks[0] = { type: 'widget' } as never;
	const duplicateCase = structuredClone(lessonFor('8.5', 'functions'));
	duplicateCase.exercise.cases[1].id = duplicateCase.exercise.cases[0].id;
	const missingExperimentProgram = structuredClone(template);
	missingExperimentProgram.experiments[0].programId = 'missing';
	const duplicateExperimentId = structuredClone(template);
	duplicateExperimentId.experiments[1].id =
		duplicateExperimentId.experiments[0].id;
	const cyclic: Record<string, unknown> = {};
	cyclic.self = cyclic;
	const invalidInput = structuredClone(template);
	(invalidInput.programs.sample as { input?: unknown }).input = cyclic;

	expect(validateLesson(null)).toContain('Lesson must be an object.');
	expect(
		validateLesson({ ...template, chapterId: 'basic-syntax' })
	).toContain('chapterId must reference a known chapter.');
	expect(
		validateLesson({ ...template, referenceChapterId: 'getting-started' })
	).toContain('referenceChapterId must reference a known source chapter.');

	expect(validateLesson({ ...template, schemaVersion: 2 })).toContain(
		'Unsupported lesson schemaVersion; expected 1.'
	);
	expect(validateLesson(missingProgram)).toContain(
		'sampleProgramId references a missing program.'
	);
	expect(validateLesson(unsupportedBlock)).toContain(
		'Section 0 block 0 has an unsupported block type.'
	);
	expect(validateLesson(duplicateCase)).toContain(
		`Duplicate case id: ${duplicateCase.exercise.cases[0].id}.`
	);
	expect(validateLesson(missingExperimentProgram)).toContain(
		'Experiment 0 programId references a missing program.'
	);
	expect(validateLesson(duplicateExperimentId)).toContain(
		`Duplicate experiment id: ${duplicateExperimentId.experiments[0].id}.`
	);
	expect(validateLesson(invalidInput)).toContain(
		'Program sample input must be JSON data.'
	);
});

for (const version of tutorialVersions) {
	test(`PHP ${version}: runs every registered lesson solution against every case`, async ({
		page,
	}) => {
		for (const lesson of lessonsByVersion[version]) {
			const solution = lesson.programs[lesson.exercise.solutionProgramId];
			const response = await startCheck(
				page,
				version,
				solution.code,
				lesson.exercise.cases
			);
			expect(response.results, `${version}/${lesson.slug}`).toHaveLength(
				lesson.exercise.cases.length
			);
			expect(
				response.results.map((result) => result.status),
				`${version}/${lesson.slug}`
			).toEqual(lesson.exercise.cases.map(() => 'passed'));
		}
	});
	test(`PHP ${version}: runs every registered Experiment Program against CLI/WASM output baselines`, async ({
		page,
	}) => {
		const tested: string[] = [];
		for (const lesson of lessonsByVersion[version]) {
			for (const experiment of lesson.experiments) {
				const expected =
					experimentOutputBaseline.versions[version]?.[lesson.slug]?.[
						experiment.id
					];
				expect(
					expected,
					`Missing CLI/WASM baseline for ${version}/${lesson.slug}/${experiment.id}`
				).toBeDefined();
				const program = lesson.programs[experiment.programId];
				expect(
					await runProgram(
						page,
						version,
						program.code,
						program.input ?? null
					),
					`${version}/${lesson.slug}/${experiment.id}`
				).toBe(expected);
				tested.push(`${lesson.slug}/${experiment.id}`);
			}
		}
		const baselineKeys = Object.entries(
			experimentOutputBaseline.versions[version]
		).flatMap(([slug, experiments]) =>
			Object.keys(experiments).map((id) => `${slug}/${id}`)
		);
		expect(tested.sort()).toEqual(baselineKeys.sort());
	});
	test(`PHP ${version}: runs every lesson Example against CLI/WASM output baselines`, async ({
		page,
	}) => {
		const tested: string[] = [];
		for (const lesson of lessonsByVersion[version]) {
			const expected =
				exampleOutputBaseline.versions[version]?.[lesson.slug];
			expect(
				expected,
				`Missing CLI/WASM Example baseline for ${version}/${lesson.slug}`
			).toBeDefined();
			const program = lesson.programs[lesson.sampleProgramId];
			expect(
				await runProgram(
					page,
					version,
					program.code,
					program.input ?? null
				),
				`${version}/${lesson.slug}`
			).toBe(expected);
			tested.push(lesson.slug);
		}
		expect(tested.sort()).toEqual(
			Object.keys(exampleOutputBaseline.versions[version]).sort()
		);
	});
}

// Expected outcomes come from the exercise requirements, not its checker code.
const negativeAnswers = [
	{
		slug: 'constants',
		violation: 'prints EUR instead of USD',
		code: "<?php const CURRENCY = 'EUR'; echo CURRENCY;",
		cases: [{ id: 'currency', input: null, status: 'failed' }],
	},
	{
		slug: 'arrays',
		violation: 'reads the first color instead of the second',
		code: '<?php echo $input[0];',
		cases: [
			{
				id: 'primary-colors',
				input: ['red', 'green', 'blue'],
				status: 'failed',
			},
			{
				id: 'warm-colors',
				input: ['orange', 'red', 'yellow'],
				status: 'failed',
			},
		],
	},
	{
		slug: 'operators',
		violation: 'does not convert minutes to seconds',
		code: '<?php echo $input;',
		cases: [
			{ id: 'ninety-minutes', input: 90, status: 'failed' },
			{ id: 'one-minute', input: 1, status: 'failed' },
			// Unchanged zero coincides with zero seconds, so this wrong answer passes.
			{ id: 'zero-minutes', input: 0, status: 'passed' },
		],
	},
	{
		slug: 'loops',
		violation: 'omits the inclusive final iteration',
		code: '<?php for ($i = 1; $i < $input; $i++) { echo $i . PHP_EOL; }',
		cases: [
			{ id: 'three-numbers', input: 3, status: 'failed' },
			{ id: 'one-number', input: 1, status: 'failed' },
			// No iterations are required at zero, even with the wrong upper bound.
			{ id: 'zero-numbers', input: 0, status: 'passed' },
		],
	},
	{
		slug: 'functions',
		violation: 'returns the number without squaring it',
		code: '<?php function square($number) { return $number; } echo square($input);',
		cases: [
			// Returning zero coincides with its square; nonzero cases distinguish them.
			{ id: 'zero', input: 0, status: 'passed' },
			{ id: 'negative', input: -3, status: 'failed' },
			{ id: 'positive', input: 5, status: 'failed' },
		],
	},
	{
		slug: 'errors',
		violation: 'does not reject a negative age',
		code: '<?php echo $input;',
		cases: [
			{ id: 'negative-age', input: -1, status: 'failed' },
			// The missing guard still produces the required normal-path age.
			{ id: 'adult-age', input: 18, status: 'passed' },
		],
	},
] as const;

for (const version of tutorialVersions) {
	test(`PHP ${version}: rejects independently specified wrong answers`, async ({
		page,
	}) => {
		for (const negative of negativeAnswers) {
			await test.step(`${negative.slug}: ${negative.violation}`, async () => {
				const lesson = lessonFor(version, negative.slug);
				expect(
					lesson.exercise.cases.map(({ id, input }) => ({
						id,
						input,
					}))
				).toEqual(
					negative.cases.map(({ id, input }) => ({ id, input }))
				);
				const response = await startCheck(
					page,
					version,
					negative.code,
					lesson.exercise.cases
				);
				expect({
					error: response.error,
					results: response.results.map(({ id, status }) => ({
						id,
						status,
					})),
				}).toEqual({
					error: undefined,
					results: negative.cases.map(({ id, status }) => ({
						id,
						status,
					})),
				});
			});
		}
	});
}

// A control mutation demonstrates that these negative expectations detect an
// always-passing checker, rather than merely agreeing with the sample solution.
for (const version of ['5.6', '8.5'] as const) {
	for (const negative of [
		{ ...negativeAnswers[0], mutantWant: ['passed'] },
		{ ...negativeAnswers[1], mutantWant: ['passed', 'passed'] },
	]) {
		test(`PHP ${version}: ${negative.slug} negative oracle distinguishes an always-pass checker`, async ({
			page,
		}) => {
			const lesson = lessonFor(version, negative.slug);
			const original = await startCheck(
				page,
				version,
				negative.code,
				lesson.exercise.cases
			);
			const mutant = await startCheck(
				page,
				version,
				negative.code,
				lesson.exercise.cases.map((entry) => ({
					...entry,
					checkPhp:
						"<?php return static function ($input, $output, $returnValue) { return ['passed' => true, 'message' => 'Mutant']; };",
				}))
			);
			expect({
				inputs: lesson.exercise.cases.map(({ id, input }) => ({
					id,
					input,
				})),
				original: original.results.map((entry) => entry.status),
				mutant: mutant.results.map((entry) => entry.status),
				originalError: original.error,
				mutantError: mutant.error,
			}).toEqual({
				inputs: negative.cases.map(({ id, input }) => ({ id, input })),
				original: negative.cases.map((entry) => entry.status),
				mutant: negative.mutantWant,
				originalError: undefined,
				mutantError: undefined,
			});
		});
	}
}

test('detects hard-coded and missing-trim answers with input-specific cases', async ({
	page,
}) => {
	const lesson = lessonFor('8.5', 'format-full-name');
	const hardcoded =
		"<?php\nfunction formatFullName($firstName, $lastName) { return 'Ada Lovelace'; }\necho formatFullName($input['first'], $input['last']);";
	const response = await expectStatuses(page, '8.5', lesson, hardcoded, [
		'passed',
		'failed',
		'failed',
		'failed',
		'failed',
	]);
	expect(response.results[1].message).toContain('Check trimming');

	const noTrim =
		"<?php\nfunction formatFullName($firstName, $lastName) { if ($firstName === '') return $lastName; if ($lastName === '') return $firstName; return $firstName . ' ' . $lastName; }\necho formatFullName($input['first'], $input['last']);";
	await expectStatuses(page, '8.5', lesson, noTrim, [
		'failed',
		'passed',
		'passed',
		'passed',
		'failed',
	]);
});

test('runs the same negative control in every supported PHP version', async ({
	page,
}) => {
	const fixedName =
		"<?php\nfunction formatFullName($firstName, $lastName) { return 'Ada Lovelace'; }\necho formatFullName($input['first'], $input['last']);";
	for (const version of tutorialVersions) {
		const lesson = lessonFor(version, 'format-full-name');
		await expectStatuses(page, version, lesson, fixedName, [
			'passed',
			'failed',
			'failed',
			'failed',
			'failed',
		]);
	}
});

for (const version of ['5.6', '8.5'] as const) {
	test(`PHP ${version}: reports PHP errors and empty output, then recovers in a fresh WASM worker`, async ({
		page,
	}) => {
		const lesson = lessonFor(version, 'functions');
		await expectStatuses(
			page,
			version,
			lesson,
			'<?php\nfunction square(',
			lesson.exercise.cases.map(() => 'error')
		);
		await expectStatuses(
			page,
			version,
			lesson,
			'<?php\nexit(1);',
			lesson.exercise.cases.map(() => 'error')
		);
		await expectStatuses(
			page,
			version,
			lesson,
			'<?php\n',
			lesson.exercise.cases.map(() => 'failed')
		);
		await expectStatuses(
			page,
			version,
			lesson,
			lesson.programs[lesson.exercise.solutionProgramId].code,
			lesson.exercise.cases.map(() => 'passed')
		);
	});
}

test('PHP 5.6: runs a Program with structured JSON input', async ({ page }) => {
	expect(
		await runProgram(
			page,
			'5.6',
			"<?php echo $input['name'] . ':' . $input['values'][1];",
			{ name: 'Ada', values: [1, 7] }
		)
	).toBe('Ada:7');
});

test('runs a Program with JSON input and can stop or time out an infinite worker', async ({
	page,
}) => {
	test.setTimeout(45_000);
	const nameLesson = lessonFor('8.5', 'format-full-name');
	const solution = nameLesson.programs[nameLesson.exercise.solutionProgramId];
	const runId = await page.evaluate(
		(input) => window.tutorialWasmHarness.start(input),
		{
			version: '8.5',
			code: solution.code,
			runInput: nameLesson.exercise.cases[0].input,
		}
	);
	const runState = await waitForState(page, runId);
	expect(runState?.status).toBe('complete');
	if (runState?.status !== 'complete')
		throw new Error('Input run did not complete.');
	expect(runState.response.output).toBe('Ada Lovelace');
	expect(runState.response.error).toBeUndefined();

	const lesson = lessonFor('8.5', 'functions');
	const infinite = await page.evaluate(
		(input) => window.tutorialWasmHarness.start(input),
		{
			version: '8.5',
			code: '<?php\nwhile (true) {}',
			cases: lesson.exercise.cases,
		}
	);
	await page.waitForTimeout(500);
	await page.evaluate((id) => window.tutorialWasmHarness.stop(id), infinite);
	expect(
		await page.evaluate(
			(id) => window.tutorialWasmHarness.read(id),
			infinite
		)
	).toEqual({ status: 'stopped' });
	await expectStatuses(
		page,
		'8.5',
		lesson,
		lesson.programs[lesson.exercise.solutionProgramId].code,
		lesson.exercise.cases.map(() => 'passed')
	);

	const timed = await page.evaluate(
		(input) => window.tutorialWasmHarness.start(input),
		{
			version: '8.5',
			code: '<?php\nwhile (true) {}',
			cases: lesson.exercise.cases,
			timeoutMs: 10_000,
		}
	);
	const timedState = await waitForState(page, timed, 12_000);
	expect(timedState).toEqual({ status: 'timeout' });
	await expectStatuses(
		page,
		'8.5',
		lesson,
		lesson.programs[lesson.exercise.solutionProgramId].code,
		lesson.exercise.cases.map(() => 'passed')
	);
});
