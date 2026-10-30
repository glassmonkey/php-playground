import { expect } from '@playwright/test';
import type { AssessmentResult } from '../types';

export type ExpectedAssessmentResult = Omit<AssessmentResult, 'message'> & {
	message: string | ReturnType<typeof expect.stringMatching>;
};

const squareCases = [
	{ id: 'zero', label: 'Square zero' },
	{ id: 'negative', label: 'Square a negative number' },
	{ id: 'positive', label: 'Square a positive number' },
];
export const squareFeedback = {
	correct: squareCases.map((entry) => ({
		...entry,
		status: 'passed',
		message: 'Square is correct.',
	})),
	empty: squareCases.map((entry) => ({
		...entry,
		status: 'failed',
		message: 'Define the square function.',
	})),

	// Engine wording/temporary PHP file paths vary by runtime. Validate the whole
	// result payload and require a ParseError/parse error/syntax diagnostic, without freezing stacks.
	parse: squareCases.map((entry) => ({
		...entry,
		status: 'error',
		message: expect.stringMatching(/parse\s*error|syntax error/i),
	})),
} satisfies Record<string, ExpectedAssessmentResult[]>;

export const nameFeedback = {
	fixed: [
		{
			id: 'trim-both-parts',
			label: 'Trim both name parts',
			status: 'passed',
			message: 'The full name is formatted correctly.',
		},
		{
			id: 'empty-first-name',
			label: 'Empty first name',
			status: 'failed',
			message: 'Check trimming and empty-name cases.',
		},
		{
			id: 'empty-last-name',
			label: 'Empty last name',
			status: 'failed',
			message: 'Check trimming and empty-name cases.',
		},
		{
			id: 'both-empty',
			label: 'Both parts empty',
			status: 'failed',
			message: 'Check trimming and empty-name cases.',
		},
		{
			id: 'whitespace-only-name',
			label: 'Whitespace-only first name',
			status: 'failed',
			message: 'Check trimming and empty-name cases.',
		},
	],
	noTrim: [
		{
			id: 'trim-both-parts',
			label: 'Trim both name parts',
			status: 'failed',
			message: 'Check trimming and empty-name cases.',
		},
		{
			id: 'empty-first-name',
			label: 'Empty first name',
			status: 'passed',
			message: 'The full name is formatted correctly.',
		},
		{
			id: 'empty-last-name',
			label: 'Empty last name',
			status: 'passed',
			message: 'The full name is formatted correctly.',
		},
		{
			id: 'both-empty',
			label: 'Both parts empty',
			status: 'passed',
			message: 'The full name is formatted correctly.',
		},
		{
			id: 'whitespace-only-name',
			label: 'Whitespace-only first name',
			status: 'failed',
			message: 'Check trimming and empty-name cases.',
		},
	],
} satisfies Record<string, ExpectedAssessmentResult[]>;

// wasm_sapi_handle_request exposes the host run_php result, not necessarily
// the argument passed to PHP exit(). php_wasm.c defines 1 for bailout/code died
// and 2 for an exception. The explicit version contract records the bundled mode.
export const requestFailureFeedback = {
	1: squareCases.map((entry) => ({
		...entry,
		status: 'error',
		message: 'PHP stopped before checking completed (exit 1).',
	})),
	2: squareCases.map((entry) => ({
		...entry,
		status: 'error',
		message: 'PHP stopped before checking completed (exit 2).',
	})),
} satisfies Record<1 | 2, AssessmentResult[]>;
