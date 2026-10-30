import { expect, it } from 'vitest';
import { lessonsByVersion } from '../content';
import { validateLesson, validateLessons } from '../validate-content';
import { tutorialVersions } from '../config';

const fresh = (slug = 'output') =>
	structuredClone(
		lessonsByVersion['8.5'].find((entry) => entry.slug === slug)!
	);

it.each(tutorialVersions)('accepts the resolved PHP %s manifest', (version) => {
	expect(validateLessons(lessonsByVersion[version])).toEqual([]);
});

it.each([
	{
		rule: 'lesson is an object',
		input: () => null,
		diagnostic: 'Lesson must be an object.',
	},
	{
		rule: 'learning chapter exists',
		input: () => ({ ...fresh(), chapterId: 'basic-syntax' }),
		diagnostic: 'chapterId must reference a known chapter.',
	},
	{
		rule: 'specification chapter exists',
		input: () => ({ ...fresh(), referenceChapterId: 'getting-started' }),
		diagnostic: 'referenceChapterId must reference a known source chapter.',
	},
	{
		rule: 'schema version is supported',
		input: () => ({ ...fresh(), schemaVersion: 2 }),
		diagnostic: 'Unsupported lesson schemaVersion; expected 1.',
	},
	{
		rule: 'Example program exists',
		input: () => ({ ...fresh(), sampleProgramId: 'missing' }),
		diagnostic: 'sampleProgramId references a missing program.',
	},
	{
		rule: 'block type is supported',
		input: () => {
			const value = fresh();
			value.sections[0].blocks[0] = { type: 'widget' } as never;
			return value;
		},
		diagnostic: 'Section 0 block 0 has an unsupported block type.',
	},
	{
		rule: 'case IDs are unique',
		input: () => {
			const value = fresh('functions');
			value.exercise.cases[1].id = 'zero';
			return value;
		},
		diagnostic: 'Duplicate case id: zero.',
	},
	{
		rule: 'Experiment program exists',
		input: () => {
			const value = fresh();
			value.experiments[0].programId = 'missing';
			return value;
		},
		diagnostic: 'Experiment 0 programId references a missing program.',
	},
	{
		rule: 'Experiment IDs are unique',
		input: () => {
			const value = fresh();
			value.experiments[1].id = 'personalized-greeting';
			return value;
		},
		diagnostic: 'Duplicate experiment id: personalized-greeting.',
	},
	{
		rule: 'input is acyclic JSON',
		input: () => {
			const value = fresh();
			const cyclic: Record<string, unknown> = {};
			cyclic.self = cyclic;
			(value.programs.sample as { input?: unknown }).input = cyclic;
			return value;
		},
		diagnostic: 'Program sample input must be JSON data.',
	},
])('rejects a manifest violating: $rule', ({ input, diagnostic }) => {
	expect(validateLesson(input())).toEqual([diagnostic]);
});
