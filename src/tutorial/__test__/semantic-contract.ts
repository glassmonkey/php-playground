import type { ExperimentLearning, LessonLearning } from '../types';

// Reviewed, test-owned authoring payloads. Equality checks consistency with this
// contract, not a general proof of natural-language educational correctness.
export const conditionalContract = {
	'if-elseif': {
		lesson: {
			prerequisiteLessons: ['expressions'],
			exampleReason:
				'The first true if or elseif condition selects a branch; === compares both type and value, and || combines alternative day checks.',
			misconceptions: [
				{
					belief: 'Every elseif branch runs after a true if branch.',
					correction:
						'Only the first matching branch in one if/elseif/else chain executes.',
				},
			],
		},
		experiment: {
			goalRef: 'lesson.goal',
			change: 'Choose a message using if and elseif.',
			observe: 'Which branch is selected by the current level.',
			reason: 'The first strict equality condition that is true supplies the message; else handles the remaining values.',
		},
	},
	match: {
		lesson: {
			prerequisiteLessons: ['expressions'],
			exampleReason:
				'The if condition chooses one branch; match uses strict comparison and returns the value from the selected arm.',
			misconceptions: [
				{
					belief: 'A match arm compares values using loose equality.',
					correction:
						'match compares both type and value using strict identity.',
				},
			],
		},
		experiment: {
			goalRef: 'lesson.goal',
			change: 'Select a message from a level value.',
			observe: 'Which message belongs to the selected level.',
			reason: 'match returns the arm whose value is strictly identical to the level, or default when none matches.',
		},
	},
} satisfies Record<
	string,
	{ lesson: LessonLearning; experiment: ExperimentLearning }
>;

const errorLesson: LessonLearning = {
	prerequisiteLessons: ['functions', 'conditionals', 'classes'],
	exampleReason:
		'The zero-divisor check throws before division; the matching catch prints the exception message.',
	misconceptions: [
		{
			belief: 'Execution continues at the statement after throw inside the try block.',
			correction:
				'A thrown exception transfers control to a matching catch; the remaining statements in that try path are skipped.',
		},
	],
};
export const divisionContract = {
	quotient: {
		lesson: errorLesson,
		experiment: {
			goalRef: 'lesson.goal',
			change: 'Supply a nonzero divisor.',
			observe:
				'Whether normal return or the catch path produces the output.',
			reason: 'The guard does not throw, so / returns the quotient and catch is skipped. Unlike intdiv, / does not truncate a non-integral quotient.',
		},
	},
	integer: {
		lesson: errorLesson,
		experiment: {
			goalRef: 'lesson.goal',
			change: 'Supply a nonzero divisor.',
			observe:
				'Whether normal return or the catch path produces the output.',
			reason: 'The guard does not throw, so integer division returns a value and catch is skipped.',
		},
	},
} satisfies Record<
	string,
	{ lesson: LessonLearning; experiment: ExperimentLearning }
>;
