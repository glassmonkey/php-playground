import type { ChapterId } from './chapters';
import type { ReferenceChapterId } from './reference-chapters';
export type JSONValue =
	| null
	| boolean
	| number
	| string
	| JSONValue[]
	| { [key: string]: JSONValue };
export interface ExerciseCase {
	id: string;
	label: string;
	input: JSONValue;
	checkPhp: string;
}
export interface AssessmentResult {
	id: string;
	label: string;
	status: 'passed' | 'failed' | 'error';
	message: string;
}
export interface Program {
	code: string;
	input?: JSONValue;
}
export type LessonBlock =
	| { type: 'paragraph'; text: string }
	| { type: 'list'; items: string[] }
	| { type: 'code'; programId: string }
	| { type: 'runtime-output'; programId: string; label: string }
	| { type: 'exercise' }
	| { type: 'experiments' }
	| { type: 'example' }
	| { type: 'solution'; label: string };
export interface LessonSection {
	id: string;
	title: string;
	blocks: LessonBlock[];
}
export interface Lesson {
	schemaVersion: 1;
	chapterId: ChapterId;
	referenceChapterId: ReferenceChapterId;
	slug: string;
	title: string;
	summary: string;
	goal: string;
	programs: Record<string, Program>;
	sampleProgramId: string;
	experiments: {
		id: string;
		title: string;
		description: string;
		programId: string;
	}[];
	sections: LessonSection[];
	exercise: {
		starterProgramId: string;
		solutionProgramId: string;
		cases: [ExerciseCase, ...ExerciseCase[]];
		prompt: string;
		hint: string;
	};
	references: { title: string; url: string }[];
}
