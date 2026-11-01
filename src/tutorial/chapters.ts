import type { Lesson } from './types';

// Learning progression; specification references live in reference-chapters.ts.
export const chapters = [
	{
		id: 'getting-started',
		title: 'Run your first script',
		includes: 'PHP tags, comments and explicit output.',
		excludes: 'Control flow and reusable abstractions.',
		assumes: 'No programming prerequisites.',
		enables: 'Reading and editing small executable scripts.',
	},
	{
		id: 'working-with-values',
		title: 'Store and inspect data',
		includes: 'Variables, scalar inspection, constants and array lookup.',
		excludes: 'Branching, iteration and object state.',
		assumes: 'A script can assign names and print values.',
		enables: 'Supplying values to calculations and conditions.',
	},
	{
		id: 'calculations',
		title: 'Calculate and compare',
		includes: 'Arithmetic, comparison and expression grouping.',
		excludes: 'Branching statements and loops.',
		assumes: 'Variables and scalar types.',
		enables: 'Constructing conditions and computed values.',
	},
	{
		id: 'decisions-and-loops',
		title: 'Choose paths and repeat steps',
		includes: 'Branch selection and bounded iteration.',
		excludes: 'User-defined function and class design.',
		assumes: 'Arrays, comparisons and grouped expressions.',
		enables: 'Reusing branch and iteration logic in functions.',
	},
	{
		id: 'using-functions',
		title: 'Use and write functions',
		includes:
			'String calls, parameter passing, returns and a small formatting function.',
		excludes: 'Recursion, namespaces and package management.',
		assumes:
			'Values, conditions and loops; string calls are explained locally before user-defined functions.',
		enables:
			'Encapsulating operations as object methods and guarded operations.',
	},
	{
		id: 'objects-and-state',
		title: 'Model data with objects',
		includes:
			'Instances, methods, enum cases and property hooks where supported.',
		excludes:
			'Inheritance frameworks, persistence and service architecture.',
		assumes: 'Functions, strings, conditions and iteration.',
		enables: 'Reasoning about state changes before handling failures.',
	},
	{
		id: 'handling-failures',
		title: 'Respond to failures',
		includes: 'Throwing, catching and completing guarded operations.',
		excludes:
			'HTTP error handling, logging infrastructure and production security.',
		assumes:
			'Functions, conditional guards, object construction and method calls.',
		enables: 'Writing small scripts that distinguish success from failure.',
	},
] as const;
export type ChapterId = (typeof chapters)[number]['id'];

export function groupLessons(lessons: readonly Lesson[]) {
	return chapters
		.map((chapter) => ({
			...chapter,
			lessons: lessons.filter(
				(lesson) => lesson.chapterId === chapter.id
			),
		}))
		.filter((chapter) => chapter.lessons.length > 0);
}
