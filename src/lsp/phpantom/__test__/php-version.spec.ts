import { describe, expect, it } from 'vitest';
import {
	applyPhpVersionCompletionFeatures,
	phpVersionCapabilities,
	phpVersionInitializationError,
} from '../php-version.mjs';

const namedArgumentFeatureCases: Array<[string, boolean]> = [
	['5.6', false],
	['7.0', false],
	['7.1', false],
	['7.2', false],
	['7.3', false],
	['7.4', false],
	['8.0', true],
	['8.1', true],
	['8.2', true],
	['8.3', true],
	['8.4', true],
	['8.5', true],
];

describe('PHP version completion capabilities', () => {
	it('requires an explicit selector version instead of falling back to PHP 8.5', () => {
		expect(
			phpVersionInitializationError(undefined, ['7.4', '8.0', '8.5'])
		).toMatch(/phpVersion is required/);
	});

	it.each(namedArgumentFeatureCases)(
		'sets namedArguments for PHP %s',
		(version, namedArguments) => {
			expect(phpVersionCapabilities(version)).toEqual({ namedArguments });
		}
	);

	it('filters only PHPantom named-argument completion markers below PHP 8.0', () => {
		const result = {
			isIncomplete: true,
			itemDefaults: {
				editRange: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 0 },
				},
			},
			items: [
				{
					label: 'required:',
					kind: 6,
					detail: 'Named argument',
					filterText: 'required',
				},
				{
					label: 'optional: bool',
					kind: 6,
					detail: 'Named argument (optional)',
					filterText: 'optional',
				},
				{
					label: 'rest:',
					kind: 6,
					detail: 'Named argument (variadic)',
					filterText: 'rest',
				},
				{
					label: '$value',
					kind: 6,
					detail: 'variable',
					filterText: '$value',
				},
				{
					label: 'name',
					kind: 10,
					detail: 'property',
					filterText: 'name',
				},
				{
					label: 'strlen($string)',
					kind: 3,
					detail: 'int',
					filterText: 'strlen',
				},
			],
		};

		const got = applyPhpVersionCompletionFeatures(
			'textDocument/completion',
			result,
			'7.4'
		);

		expect(got).toEqual({
			isIncomplete: true,
			itemDefaults: {
				editRange: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 0 },
				},
			},
			items: [
				{
					label: '$value',
					kind: 6,
					detail: 'variable',
					filterText: '$value',
				},
				{
					label: 'name',
					kind: 10,
					detail: 'property',
					filterText: 'name',
				},
				{
					label: 'strlen($string)',
					kind: 3,
					detail: 'int',
					filterText: 'strlen',
				},
			],
		});
	});

	it('retains named-argument completion from PHP 8.0 and leaves signature data untouched', () => {
		const completion = {
			items: [
				{
					label: 'before_needle: bool',
					kind: 6,
					detail: 'Named argument (optional)',
				},
				{ label: '$needle', kind: 6, detail: 'variable' },
			],
		};
		const signature = {
			activeParameter: 2,
			signatures: [
				{
					label: '(string $haystack, string $needle, bool $before_needle = false): string|false',
				},
			],
		};

		expect(
			applyPhpVersionCompletionFeatures(
				'textDocument/completion',
				completion,
				'8.0'
			)
		).toBe(completion);
		expect(
			applyPhpVersionCompletionFeatures(
				'textDocument/signatureHelp',
				signature,
				'7.4'
			)
		).toBe(signature);
	});
});
