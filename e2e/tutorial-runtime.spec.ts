import { negativeAnswers } from '../src/tutorial/__test__/negative-contract';
import {
	nameFeedback,
	requestFailureFeedback,
	squareFeedback,
	type ExpectedAssessmentResult,
} from '../src/tutorial/__test__/feedback-contract';
import { versionCases } from '../src/tutorial/__test__/version-contract';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { lessonsByVersion } from '../src/tutorial/content';
import { tutorialVersions } from '../src/tutorial/config';
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
				requestId?: string;
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
	cases: ExerciseCase[],
	requestId = crypto.randomUUID()
) {
	const id = await page.evaluate(
		(input) => window.tutorialWasmHarness.start(input),
		{ version, code, cases, requestId }
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
	want: readonly ExpectedAssessmentResult[]
) {
	const requestId = crypto.randomUUID();
	const response = await startCheck(
		page,
		version,
		code,
		lesson.exercise.cases,
		requestId
	);
	expect(response).toEqual({ requestId, results: want });
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
				const requestId = crypto.randomUUID();
				const response = await startCheck(
					page,
					version,
					negative.code,
					lesson.exercise.cases,
					requestId
				);
				expect(response).toEqual({
					requestId,
					results: negative.cases.map(
						({ id, label, status, message }) => ({
							id,
							label,
							status,
							message,
						})
					),
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
			const originalId = crypto.randomUUID();
			const mutantId = crypto.randomUUID();
			const original = await startCheck(
				page,
				version,
				negative.code,
				lesson.exercise.cases,
				originalId
			);
			const mutant = await startCheck(
				page,
				version,
				negative.code,
				lesson.exercise.cases.map((entry) => ({
					...entry,
					checkPhp:
						"<?php return static function ($input, $output, $returnValue) { return ['passed' => true, 'message' => 'Mutant']; };",
				})),
				mutantId
			);
			expect(original).toEqual({
				requestId: originalId,
				results: negative.cases.map(
					({ id, label, status, message }) => ({
						id,
						label,
						status,
						message,
					})
				),
			});
			expect(mutant).toEqual({
				requestId: mutantId,
				results: negative.cases.map(({ id, label }) => ({
					id,
					label,
					status: 'passed',
					message: 'Mutant',
				})),
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
	await expectStatuses(page, '8.5', lesson, hardcoded, nameFeedback.fixed);

	const noTrim =
		"<?php\nfunction formatFullName($firstName, $lastName) { if ($firstName === '') return $lastName; if ($lastName === '') return $firstName; return $firstName . ' ' . $lastName; }\necho formatFullName($input['first'], $input['last']);";
	await expectStatuses(page, '8.5', lesson, noTrim, nameFeedback.noTrim);
});

test('runs the same negative control in every supported PHP version', async ({
	page,
}) => {
	const fixedName =
		"<?php\nfunction formatFullName($firstName, $lastName) { return 'Ada Lovelace'; }\necho formatFullName($input['first'], $input['last']);";
	for (const version of tutorialVersions) {
		const lesson = lessonFor(version, 'format-full-name');
		await expectStatuses(
			page,
			version,
			lesson,
			fixedName,
			nameFeedback.fixed
		);
	}
});

for (const [version, expectedVersion] of versionCases) {
	test(`PHP ${version}: reports PHP errors and empty output, then recovers in a fresh WASM worker`, async ({
		page,
	}) => {
		const lesson = lessonFor(version, 'functions');
		await expectStatuses(
			page,
			version,
			lesson,
			'<?php\nfunction square(',
			squareFeedback.parse
		);
		await expectStatuses(
			page,
			version,
			lesson,
			'<?php\nexit(1);',
			requestFailureFeedback[expectedVersion.requestFailureFlag]
		);
		await expectStatuses(
			page,
			version,
			lesson,
			'<?php\n',
			squareFeedback.empty
		);
		await expectStatuses(
			page,
			version,
			lesson,
			lesson.programs[lesson.exercise.solutionProgramId].code,
			squareFeedback.correct
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
		squareFeedback.correct
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
		squareFeedback.correct
	);
});
