// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type * as Monaco from 'monaco-editor';
import type { Version } from '../../php-wasm/php';
import { isPhpIdentifierContext } from '../editor-context';
const targets: Version[] = [
	'5.6',
	'7.0',
	'7.1',
	'7.2',
	'7.3',
	'7.4',
	'8.0',
	'8.1',
	'8.2',
	'8.3',
	'8.4',
	'8.5',
];
const all = targets.map(() => true),
	none = targets.map(() => false),
	php8 = [
		false,
		false,
		false,
		false,
		false,
		false,
		true,
		true,
		true,
		true,
		true,
		true,
	];
const pre8Code = [
	true,
	true,
	true,
	true,
	true,
	true,
	false,
	false,
	false,
	false,
	false,
	false,
];
const fixtures = [
	{ name: 'backtick body', source: '<?php\n$x=`Wi|get`;', want: none },
	{
		name: 'escaped backtick',
		source: '<?php\n$x=`before\\` Wi|get`;',
		want: none,
	},
	{
		name: 'multiline backtick',
		source: '<?php\n$x=`before\nWi|get\nafter`;',
		want: none,
	},
	{ name: 'unterminated backtick', source: '<?php\n$x=`Wi|get', want: none },
	{
		name: 'backtick fake tags/comment/heredoc',
		source: '<?php\n$x=`?> #[ <<<TXT\n/* Wi|get`;',
		want: none,
	},
	{
		name: 'code after backtick',
		source: '<?php\n$x=`echo ok`;new Wi|get;',
		want: all,
	},
	{
		name: 'even backslashes close backtick',
		source: '<?php\n$x=`slash\\\\`;new Wi|get;',
		want: all,
	},
	{
		name: 'escaped double quote',
		source: '<?php\n$s="before\\" Wi|get";',
		want: none,
	},
	{
		name: 'escaped single quote',
		source: "<?php\n$s='before\\' Wi|get';",
		want: none,
	},
	{
		name: 'multiline double quote',
		source: '<?php\n$s="before\nWi|get\nafter";',
		want: none,
	},
	{
		name: 'unterminated double quote',
		source: '<?php\n$s="Wi|get',
		want: none,
	},
	{
		name: 'quoted interpolation argument',
		source: '<?php\n$s="{$a["Wi|get"]}";',
		want: none,
	},
	{
		name: 'code after nested interpolation',
		source: '<?php\n$s="{$a["key"]}";new Wi|get;',
		want: all,
	},
	{ name: 'ordinary hash comment', source: '<?php\n# Wi|get', want: none },
	{
		name: 'attribute version boundary',
		source: '<?php\n#[Wi|get] class A {}',
		want: php8,
	},
	{
		name: 'multiple attributes and nested arrays',
		source: '<?php\n#[A([1,[2]])] #[Wi|get] class B {}',
		want: php8,
	},
	{
		name: 'attribute quoted argument',
		source: '<?php\n#[A("Wi|get")] class B {}',
		want: none,
	},
	{
		name: 'attribute multiline quoted argument',
		source: '<?php\n#[A("before\nWi|get\nafter")] class B {}',
		want: pre8Code,
	},
	{
		name: 'attribute comment argument',
		source: '<?php\n#[A(/* Wi|get */)] class B {}',
		want: none,
	},
	{
		name: 'attribute fake delimiter in quoted argument',
		source: '<?php\n#[A("] ?> #[ Wi|get")] class B {}',
		want: none,
	},
	{
		name: 'code after attribute same line',
		source: '<?php\n#[A("]",[1,[2]])] class B {} new Wi|get;',
		want: php8,
	},
	{
		name: 'code after attribute next line',
		source: '<?php\n#[A]\nclass B {} new Wi|get;',
		want: all,
	},
	{
		name: 'block comment fake attribute',
		source: '<?php\n/* #[ ] ?>\nWi|get */',
		want: none,
	},
	{
		name: 'line comment closes PHP to HTML',
		source: '<?php // ?> Wi|get',
		want: none,
	},
	{
		name: 'hash comment closes PHP to HTML',
		source: '<?php # ?> Wi|get',
		want: none,
	},
	{
		name: 'PHP reopens after line comment close',
		source: '<?php // ?>html <?= new Wi|get;',
		want: all,
	},
	{
		name: 'closing tag inside quote stays opaque',
		source: '<?php\n$s="?> Wi|get";',
		want: none,
	},
	{
		name: 'XML is HTML',
		source: '<?xml version="1.0"?>\n<div>Wi|get</div>',
		want: none,
	},
	{
		name: 'phpfoo is not an opening tag',
		source: '<?phpfoo Wi|get',
		want: none,
	},
	{ name: 'plain HTML', source: '<div>Wi|get</div>', want: none },
	{
		name: 'existing app bare whitespace PHP tag',
		source: '<?\nnew Wi|get;',
		want: all,
	},
	{ name: 'short echo opening tag', source: '<?= new Wi|get;', want: all },
	{
		name: 'case insensitive standard PHP tag',
		source: '<?PHP\nnew Wi|get;',
		want: all,
	},
	{
		name: 'heredoc contains backticks/attribute/tags',
		source: '<?php\n$s=<<<TXT\n` #[ ?>\nWi|get\nTXT;',
		want: none,
	},
	{
		name: 'code after opaque heredoc',
		source: '<?php\n$s=<<<TXT\n` " /* #[ ?>\nTXT;\nnew Wi|get;',
		want: all,
	},
	{
		name: 'CRLF backtick',
		source: '<?php\r\n$x=`line\r\nWi|get\r\n`;',
		want: none,
	},
];
describe('version-aware code versus opaque eligibility', () => {
	beforeEach(() => vi.clearAllMocks());
	it.each(
		targets.flatMap((version, index) =>
			fixtures.map((f) => ({ ...f, version, expected: f.want[index] }))
		)
	)('$version $name', ({ source, version, expected }) => {
		// Arrange: an intentionally permissive tokenizer cannot authorize opaque text.
		const offset = source.indexOf('|'),
			text = source.replace('|', ''),
			prefix = text.slice(0, offset).split('\n');
		const tokenize = vi.fn((copy: string) =>
			copy.split('\n').map(() => [
				{
					offset: 0,
					type: 'identifier.php',
					language: 'php',
					_tokenBrand: undefined,
				},
			])
		);
		// Act
		const got = isPhpIdentifierContext(
			text,
			prefix.length - 1,
			prefix.at(-1)!.length,
			version,
			tokenize as typeof Monaco.editor.tokenize
		);
		// Assert
		expect({ eligible: got, calls: tokenize.mock.calls.length }).toEqual({
			eligible: expected,
			calls: expected ? 1 : 0,
		});
	});
	it.each([0, 10, 100, 250, 500])(
		'tokenizes once after %i closed heredocs',
		(count) => {
			// Arrange: the oracle is one call over a width-preserving complete copy, not a time budget.
			const source =
				'<?php\n' +
				Array.from(
					{ length: count },
					(_, i) => `$s${i}=<<<T${i}\nbody\nT${i};\n`
				).join('') +
				'new Wiget();';
			const tokenize = vi.fn((copy: string) =>
				copy.split('\n').map(() => [
					{
						offset: 0,
						type: 'identifier.php',
						language: 'php',
						_tokenBrand: undefined,
					},
				])
			);
			// Act
			const got = isPhpIdentifierContext(
				source,
				source.split('\n').length - 1,
				6,
				'8.5',
				tokenize as typeof Monaco.editor.tokenize
			);
			// Assert
			expect({
				eligible: got,
				calls: tokenize.mock.calls.length,
				units: tokenize.mock.calls[0][0].length,
			}).toEqual({ eligible: true, calls: 1, units: source.length });
		}
	);
});
