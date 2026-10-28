import type { Lesson } from './types';

// Learning progression; specification references live in reference-chapters.ts.
export const chapters = [
	{ id: 'getting-started', title: 'Run your first script' },
	{ id: 'working-with-values', title: 'Store and inspect data' },
	{ id: 'calculations', title: 'Calculate and compare' },
	{ id: 'decisions-and-loops', title: 'Choose paths and repeat steps' },
	{ id: 'using-functions', title: 'Use and write functions' },
	{ id: 'objects-and-state', title: 'Model data with objects' },
	{ id: 'handling-failures', title: 'Respond to failures' },
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
