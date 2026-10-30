import { describe, expect, it } from 'vitest';
import { lessonsByVersion } from '../content';
import { tutorialVersions, type TutorialVersion } from '../config';
import { validateLesson, validateLessons } from '../validate-content';

function lesson(version: TutorialVersion, slug: string) {
	return structuredClone(
		lessonsByVersion[version].find((entry) => entry.slug === slug)!
	);
}

describe('resolved learning review data', () => {
	it.each(tutorialVersions)(
		'validates learning references and prerequisite order on %s',
		(version) => {
			expect(
				validateLessons(
					JSON.parse(JSON.stringify(lessonsByVersion[version]))
				)
			).toEqual([]);
		}
	);
	// These boundary probes guard variant selection; natural-language meaning
	// still requires source/educational review, not keyword matching alone.
	it.each([
		{
			version: '7.4',
			variant: 'strict if/elseif branches',
			syntax: "if ($level === 'beginner')",
			reason: 'The first strict equality condition that is true supplies the message; else handles the remaining values.',
		},
		{
			version: '8.0',
			variant: 'strict match arms',
			syntax: 'match ($level)',
			reason: 'match returns the arm whose value is strictly identical to the level, or default when none matches.',
		},
	] as const)(
		'selects $variant at the PHP $version boundary',
		({ version, syntax, reason }) => {
			const value = lesson(version, 'conditionals');
			const experiment = value.experiments.find(
				(entry) => entry.id === 'match-level'
			)!;
			expect(value.programs[experiment.programId].code).toContain(syntax);
			expect(experiment.learning.reason).toBe(reason);
		}
	);
	it.each([
		{
			version: '5.6',
			variant: 'untruncated quotient',
			syntax: 'return $left / $right;',
			reason: 'The guard does not throw, so / returns the quotient and catch is skipped. Unlike intdiv, / does not truncate a non-integral quotient.',
		},
		{
			version: '7.0',
			variant: 'integer division',
			syntax: 'return intdiv($left, $right);',
			reason: 'The guard does not throw, so integer division returns a value and catch is skipped.',
		},
	] as const)(
		'selects $variant at the PHP $version boundary',
		({ version, syntax, reason }) => {
			const value = lesson(version, 'errors');
			const experiment = value.experiments.find(
				(entry) => entry.id === 'successful-division'
			)!;
			expect(value.programs[experiment.programId].code).toContain(syntax);
			expect(experiment.learning.reason).toBe(reason);
		}
	);
	it('rejects a missing explanation instead of accepting only a runnable program', () => {
		const value = lesson('8.5', 'output');
		value.experiments[0].learning.reason = '';
		expect(validateLesson(value)).toContain(
			'Experiment 0 learning.reason must be nonempty.'
		);
	});
	it('rejects a goal reference outside the owning lesson', () => {
		const value = JSON.parse(JSON.stringify(lesson('8.5', 'output')));
		value.experiments[0].learning.goalRef = 'missing.goal';
		expect(validateLesson(value)).toContain(
			'Experiment 0 goalRef must reference lesson.goal.'
		);
	});
	it('rejects missing misconception corrections', () => {
		const value = lesson('8.5', 'output');
		value.learning.misconceptions[0].correction = '';
		expect(validateLesson(value)).toContain(
			'learning.misconceptions must pair beliefs with corrections.'
		);
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
			expect(validateLessons(values)).toContain(
				`Lesson 1: prerequisite ${prerequisite} must be an earlier lesson in this version.`
			);
		}
	);
});
