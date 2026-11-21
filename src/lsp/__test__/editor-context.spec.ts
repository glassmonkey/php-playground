// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type * as Monaco from 'monaco-editor';
import type { Version } from '../../php-wasm/php';
import { isPhpIdentifierContext } from '../editor-context';

const fixtures = [
	{
		name: 'unquoted body',
		marked: '<?php\n$s=<<<TXT\nWi|get\nTXT;',
		open: [1],
		want: false,
	},
	{
		name: 'single quoted nowdoc',
		marked: "<?php\n$s=<<<'TXT'\nWi|get\nTXT;",
		open: [1],
		want: false,
	},
	{
		name: 'double quoted heredoc',
		marked: '<?php\n$s=<<<"TXT"\nWi|get\nTXT;',
		open: [1],
		want: false,
	},
	{
		name: 'unterminated',
		marked: '<?php\n$s=<<<TXT\nWi|get',
		open: [1],
		want: false,
	},
	{
		name: 'similar closing prefix',
		marked: '<?php\n$s=<<<TXT\nTXT_MORE\nWi|get\nTXT;',
		open: [1],
		want: false,
	},
	{
		name: 'PHP-looking body',
		marked: '<?php\n$s=<<<TXT\n?> " /*\n<<<OTHER\nWi|get\nTXT;',
		open: [1],
		want: false,
	},
	{
		name: 'CRLF',
		marked: '<?php\r\n$s=<<<TXT\r\nWi|get\r\nTXT;',
		open: [1],
		want: false,
	},
	{
		name: 'second interval',
		marked: '<?php\n$s=<<<ONE\nbody\nONE;\n$t=<<<TWO\nWi|get\nTWO;',
		open: [1, 4],
		want: false,
	},
	{
		name: 'immediate code after terminator',
		marked: '<?php\n$s=<<<TXT\nbody\nTXT;new Wi|get();',
		open: [1],
		want: true,
		flexibleOnly: true,
	},
	{
		name: 'indented terminator',
		marked: '<?php\n$s=<<<TXT\n  body\n  TXT;new Wi|get();',
		open: [1],
		want: true,
		flexibleOnly: true,
	},
	{
		name: 'invalid mixed indent',
		marked: '<?php\n$s=<<<TXT\n \tbody\n \tTXT;new Wi|get();',
		open: [1],
		want: false,
	},
	{
		name: 'insufficient body indentation',
		marked: '<?php\n$s=<<<TXT\n body\n  TXT;new Wi|get();',
		open: [1],
		want: false,
	},
	{
		name: 'ordinary closing line then code',
		marked: '<?php\n$s=<<<TXT\nbody\nTXT;\nnew Wi|get();',
		open: [1],
		want: true,
	},
	{
		name: 'false opener in string',
		marked: '<?php\n$s="<<<TXT\nWi|get\nTXT";',
		open: [],
		blocked: [1, 2],
		want: false,
	},
	{
		name: 'false opener in comment',
		marked: '<?php\n/* <<<TXT\nWi|get\nTXT */',
		open: [],
		blocked: [1, 2],
		want: false,
	},
	{
		name: 'false opener in HTML',
		marked: '<div><<<TXT\nWi|get\nTXT</div>',
		open: [],
		blocked: [0, 1],
		want: false,
	},
	{
		name: 'string false opener before code',
		marked: '<?php\n$s="<<<TXT\nbody";\nnew Wi|get();',
		open: [],
		blocked: [1, 2],
		want: true,
	},
	{
		name: 'comment false opener before code',
		marked: '<?php\n/* <<<TXT\nbody */\nnew Wi|get();',
		open: [],
		blocked: [1, 2],
		want: true,
	},
	{
		name: 'HTML false opener before code',
		marked: '<<<TXT\n<div>body</div>\n<?php new Wi|get();',
		open: [],
		blocked: [0, 1],
		want: true,
	},
];
const versions: Version[] = ['5.6', '7.2', '7.3', '8.5'];
describe('PHP identifier eligibility with bounded heredoc intervals', () => {
	beforeEach(() => vi.clearAllMocks());
	it.each(
		versions.flatMap((version) =>
			fixtures.map((fixture) => ({ ...fixture, version }))
		)
	)(
		'$version $name',
		({ marked, open, blocked = [], want, flexibleOnly, version }) => {
			// Arrange: fixed token categories stand in for the separately measured public CDN tokenizer.
			const text = marked.replace('|', ''),
				prefix = marked.slice(0, marked.indexOf('|')),
				line = prefix.split('\n').length - 1,
				column = prefix.split('\n').at(-1)!.length;
			const tokens = text
				.split('\n')
				.map(() => [
					{ offset: 0, type: 'identifier.php', language: 'php' },
				]);
			for (const index of open)
				tokens[index] = [
					{ offset: 0, type: 'delimiter.php', language: 'php' },
				];
			for (const index of blocked)
				tokens[index] = [
					{ offset: 0, type: 'string.php', language: 'php' },
				];
			const tokenize = vi
				.fn()
				.mockReturnValue(
					tokens
				) as unknown as typeof Monaco.editor.tokenize;
			const expected =
				flexibleOnly && ['5.6', '7.2'].includes(version) ? false : want;
			// Act
			const got = isPhpIdentifierContext(
				text,
				line,
				column,
				version,
				tokenize
			);
			// Assert
			expect(got).toBe(expected);
		}
	);
	it('preserves UTF16 offsets/newlines and restores tokenizer state after an opaque body', () => {
		// Arrange
		const source = '<?php\r\n$s=<<<TXT\r\n😀"/*?>\r\nTXT; new Wiget();';
		const tokens = [
			[],
			[{ offset: 0, type: 'delimiter.php', language: 'php' }],
			[],
			[{ offset: 0, type: 'identifier.php', language: 'php' }],
		];
		const tokenize = vi.fn().mockReturnValue(tokens);
		// Act
		const got = isPhpIdentifierContext(
			source,
			3,
			12,
			'8.5',
			tokenize as typeof Monaco.editor.tokenize
		);
		// Assert
		expect({ eligible: got, calls: tokenize.mock.calls }).toEqual({
			eligible: true,
			calls: [
				[
					// 😀 is two UTF16 code units; quote/slash/star/question/greater-than add five.
					'<?php\r\n$s=      \r\n       \r\n   ; new Wiget();',
					'php',
				],
			],
		});
	});
});
