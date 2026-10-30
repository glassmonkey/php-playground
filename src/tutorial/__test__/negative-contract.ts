import type { AssessmentResult, JSONValue } from '../types';

// Expected outcomes come from the exercise requirements, not its checker code.
export const negativeAnswers = [
	{
		slug: 'constants',
		violation: 'prints EUR instead of USD',
		code: "<?php const CURRENCY = 'EUR'; echo CURRENCY;",
		cases: [
			{
				id: 'currency',
				label: 'Print currency constant',
				input: null,
				status: 'failed',
				message: 'Check the constant name and output.',
			},
		],
	},
	{
		slug: 'arrays',
		violation: 'reads the first color instead of the second',
		code: '<?php echo $input[0];',
		cases: [
			{
				id: 'primary-colors',
				label: 'Primary colors',
				input: ['red', 'green', 'blue'],
				status: 'failed',
				message: 'Output does not match this case.',
			},
			{
				id: 'warm-colors',
				label: 'Warm colors',
				input: ['orange', 'red', 'yellow'],
				status: 'failed',
				message: 'Output does not match this case.',
			},
		],
	},
	{
		slug: 'operators',
		violation: 'does not convert minutes to seconds',
		code: '<?php echo $input;',
		cases: [
			{
				id: 'ninety-minutes',
				label: '90 minutes',
				input: 90,
				status: 'failed',
				message: 'Output does not match this case.',
			},
			{
				id: 'one-minute',
				label: '1 minute',
				input: 1,
				status: 'failed',
				message: 'Output does not match this case.',
			},
			// Unchanged zero coincides with zero seconds.
			{
				id: 'zero-minutes',
				label: '0 minutes',
				input: 0,
				status: 'passed',
				message: 'Output matches.',
			},
		],
	},
	{
		slug: 'loops',
		violation: 'omits the inclusive final iteration',
		code: '<?php for ($i = 1; $i < $input; $i++) { echo $i . PHP_EOL; }',
		cases: [
			{
				id: 'three-numbers',
				label: 'Count to 3',
				input: 3,
				status: 'failed',
				message: 'Output does not match this case.',
			},
			{
				id: 'one-number',
				label: 'Count to 1',
				input: 1,
				status: 'failed',
				message: 'Output does not match this case.',
			},
			// No iterations are required at zero, even with the wrong bound.
			{
				id: 'zero-numbers',
				label: 'Count to 0',
				input: 0,
				status: 'passed',
				message: 'Output matches.',
			},
		],
	},
	{
		slug: 'functions',
		violation: 'returns the number without squaring it',
		code: '<?php function square($number) { return $number; } echo square($input);',
		cases: [
			// Returning zero coincides with its square.
			{
				id: 'zero',
				label: 'Square zero',
				input: 0,
				status: 'passed',
				message: 'Square is correct.',
			},
			{
				id: 'negative',
				label: 'Square a negative number',
				input: -3,
				status: 'failed',
				message: 'The square result does not match this input.',
			},
			{
				id: 'positive',
				label: 'Square a positive number',
				input: 5,
				status: 'failed',
				message: 'The square result does not match this input.',
			},
		],
	},
	{
		slug: 'errors',
		violation: 'does not reject a negative age',
		code: '<?php echo $input;',
		cases: [
			{
				id: 'negative-age',
				label: 'Negative age',
				input: -1,
				status: 'failed',
				message: 'Output does not match this case.',
			},
			// The missing guard still produces the required normal-path age.
			{
				id: 'adult-age',
				label: 'Non-negative age',
				input: 18,
				status: 'passed',
				message: 'Output matches.',
			},
		],
	},
] as const satisfies readonly {
	slug: string;
	violation: string;
	code: string;
	cases: readonly (AssessmentResult & { input: JSONValue })[];
}[];
