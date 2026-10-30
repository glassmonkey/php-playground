import { conditionalPrograms, divisionPrograms } from './program-contract';
import { conditionalContract, divisionContract } from './semantic-contract';
import { describe, expect, it } from 'vitest';
import { lessonsByVersion } from '../content';
import { tutorialVersions, type TutorialVersion } from '../config';
import { validateLesson, validateLessons } from '../validate-content';
import { versionCases, versionContract } from './version-contract';

function lesson(version: TutorialVersion, slug: string) {
	return structuredClone(
		lessonsByVersion[version].find((entry) => entry.slug === slug)!
	);
}

describe('resolved learning review data', () => {
	it('has an explicit expectation for exactly every supported version', () => {
		expect(Object.keys(versionContract).sort()).toEqual(
			[...tutorialVersions].sort()
		);
	});
	it.each(versionCases)(
		'publishes the complete PHP %s lesson inventory',
		(version, expected) => {
			expect(
				lessonsByVersion[version].map((entry) => entry.slug)
			).toEqual(expected.lessons);
		}
	);
	it.each(versionCases)(
		'provides the complete conditional Program for PHP %s',
		(version, expected) => {
			const value = lesson(version, 'conditionals');
			const experiment = value.experiments.find(
				(entry) => entry.id === 'match-level'
			)!;
			expect(value.programs[experiment.programId]).toEqual(
				conditionalPrograms[expected.conditionals]
			);
		}
	);
	it.each(versionCases)(
		'provides the complete division Program for PHP %s',
		(version, expected) => {
			const value = lesson(version, 'errors');
			const experiment = value.experiments.find(
				(entry) => entry.id === 'successful-division'
			)!;
			expect(value.programs[experiment.programId]).toEqual(
				divisionPrograms[expected.division]
			);
		}
	);
	it.each(versionCases)(
		'provides the full conditional lesson notes for PHP %s',
		(version, expected) => {
			expect(lesson(version, 'conditionals').learning).toEqual(
				conditionalContract[expected.conditionals].lesson
			);
		}
	);
	it.each(versionCases)(
		'provides the full conditional Experiment notes for PHP %s',
		(version, expected) => {
			expect(
				lesson(version, 'conditionals').experiments.find(
					(entry) => entry.id === 'match-level'
				)!.learning
			).toEqual(conditionalContract[expected.conditionals].experiment);
		}
	);
	it.each(versionCases)(
		'provides the full division lesson notes for PHP %s',
		(version, expected) => {
			expect(lesson(version, 'errors').learning).toEqual(
				divisionContract[expected.division].lesson
			);
		}
	);
	it.each(versionCases)(
		'provides the full division Experiment notes for PHP %s',
		(version, expected) => {
			expect(
				lesson(version, 'errors').experiments.find(
					(entry) => entry.id === 'successful-division'
				)!.learning
			).toEqual(divisionContract[expected.division].experiment);
		}
	);
	// Boundary rows retain explicit reviewed semantic variants, independent of the
	// per-version selection table. Program output remains covered by real WASM fixtures.
	it.each([
		{ version: '7.4', variant: 'if-elseif' },
		{ version: '8.0', variant: 'match' },
	] as const)('selects $variant at PHP $version', ({ version, variant }) => {
		expect(
			lesson(version, 'conditionals').experiments.find(
				(entry) => entry.id === 'match-level'
			)!.learning
		).toEqual(conditionalContract[variant].experiment);
	});
	it.each([
		{ version: '5.6', variant: 'quotient' },
		{ version: '7.0', variant: 'integer' },
	] as const)(
		'selects $variant division at PHP $version',
		({ version, variant }) => {
			expect(
				lesson(version, 'errors').experiments.find(
					(entry) => entry.id === 'successful-division'
				)!.learning
			).toEqual(divisionContract[variant].experiment);
		}
	);
	it('rejects a missing explanation instead of accepting only a runnable program', () => {
		const value = lesson('8.5', 'output');
		value.experiments[0].learning.reason = '';
		expect(validateLesson(value)).toEqual([
			'Experiment 0 learning.reason must be nonempty.',
		]);
	});
	it('rejects a goal reference outside the owning lesson', () => {
		const value = JSON.parse(JSON.stringify(lesson('8.5', 'output')));
		value.experiments[0].learning.goalRef = 'missing.goal';
		expect(validateLesson(value)).toEqual([
			'Experiment 0 goalRef must reference lesson.goal.',
		]);
	});
	it('rejects missing misconception corrections', () => {
		const value = lesson('8.5', 'output');
		value.learning.misconceptions[0].correction = '';
		expect(validateLesson(value)).toEqual([
			'learning.misconceptions must pair beliefs with corrections.',
		]);
	});
	it('detects an errors lesson without its object prerequisite', () => {
		const values = lessonsByVersion['5.6'].filter(
			(entry) => entry.slug !== 'classes'
		);
		expect(validateLessons(values)).toEqual([
			`Lesson ${values.findIndex((entry) => entry.slug === 'errors') + 1}: prerequisite classes must be an earlier lesson in this version.`,
		]);
	});
	it.each(['missing-lesson', 'classes'])(
		'rejects unavailable or later prerequisite %s',
		(prerequisite) => {
			const values = structuredClone(lessonsByVersion['8.5']);
			values[0].learning.prerequisiteLessons = [prerequisite];
			expect(validateLessons(values)).toEqual([
				`Lesson 1: prerequisite ${prerequisite} must be an earlier lesson in this version.`,
			]);
		}
	);
});
