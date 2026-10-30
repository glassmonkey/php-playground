import { describe, expect, it } from 'vitest';
import { lessonsByVersion } from '../content';
import { tutorialVersions } from '../config';
import { validateLesson, validateLessons } from '../validate-content';

function lesson(version: '5.6' | '8.5', slug: string) {
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
	it('keeps conditional reasons aligned with the selected version syntax', () => {
		const old = lesson('5.6', 'conditionals');
		const current = lesson('8.5', 'conditionals');
		expect(old.programs['exp-match-level'].code).toContain('elseif');
		expect(old.experiments[0].learning.reason).toContain(
			'strict equality condition'
		);
		expect(old.learning.exampleReason).not.toContain('match');
		expect(current.programs['exp-match-level'].code).toContain('match (');
		expect(current.experiments[0].learning.reason).toContain('match');
	});
	it('distinguishes legacy division from integer division in review reasons', () => {
		const old = lesson('5.6', 'errors');
		const current = lesson('8.5', 'errors');
		expect(old.programs['exp-successful-division'].code).toContain(
			'return $left / $right;'
		);
		expect(old.experiments[0].learning.reason).toContain(
			'/ returns the quotient'
		);
		expect(current.programs['exp-successful-division'].code).toContain(
			'return intdiv('
		);
		expect(current.experiments[0].learning.reason).toContain(
			'integer division'
		);
	});
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
