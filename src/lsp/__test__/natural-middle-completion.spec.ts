// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type * as Monaco from 'monaco-editor';
import { bindNaturalMiddleCompletion } from '../natural-middle-completion';

function scene(marked: string, tokenType = 'identifier.php', tail = 3) {
	const offset = marked.indexOf('|');
	let source = marked.replace('|', '');
	let version = 1;
	let position = {
		lineNumber: source.slice(0, offset).split('\n').length,
		column: source.slice(0, offset).split('\n').at(-1)!.length + 1,
	};
	const initial = { ...position };
	const handlers = new Map<string, Set<(event: unknown) => void>>();
	const on = (name: string) => (handler: (event: unknown) => void) => {
		const list = handlers.get(name) ?? new Set();
		list.add(handler);
		handlers.set(name, list);
		return { dispose: () => list.delete(handler) };
	};
	const emit = (name: string, event?: unknown) =>
		handlers.get(name)?.forEach((handler) => handler(event));
	const model = {
		getValue: () => source,
		getVersionId: () => version,
		isDisposed: () => false,
		getLanguageId: () => 'php',
		getWordAtPosition: () => ({
			word: 'Wiget',
			startColumn: initial.column - 2,
			endColumn: initial.column + tail,
		}),
	};
	const domElements = new Map<string, object>();
	const editor = {
		getModel: () => model,
		hasTextFocus: () => true,
		getPosition: () => position,
		getSelections: () => [{ isEmpty: () => true }],
		getDomNode: () => ({
			querySelector: (selector: string): object | null =>
				domElements.get(selector) ?? null,
		}),
		onKeyDown: on('keyDown'),
		onKeyUp: on('keyUp'),
		onDidCompositionStart: on('compositionStart'),
		onDidCompositionEnd: on('compositionEnd'),
		onDidBlurEditorText: on('blur'),
		onDidChangeModel: on('modelChange'),
		onDidDispose: on('dispose'),
		onDidChangeModelContent: on('change'),
		trigger: vi.fn(),
	};
	const tokenize = vi.fn((text: string) =>
		text
			.split('\n')
			.map(() => [{ offset: 0, type: tokenType, language: 'php' }])
	);
	const controller = new AbortController();
	const bind = () =>
		bindNaturalMiddleCompletion({
			editor: editor as unknown as Monaco.editor.IStandaloneCodeEditor,
			model: model as unknown as Monaco.editor.ITextModel,
			monaco: { editor: { tokenize } } as unknown as typeof Monaco,
			signal: controller.signal,
			phpVersion: '8.5',
		});
	const keyDown = (key: string, modifiers = {}) =>
		emit('keyDown', {
			browserEvent: { key, isComposing: false },
			ctrlKey: false,
			metaKey: false,
			altKey: false,
			...modifiers,
		});
	const insert = (text: string, rangeLength = 0) => {
		const range = {
			startLineNumber: initial.lineNumber,
			endLineNumber: initial.lineNumber,
			startColumn: initial.column,
			endColumn: initial.column + rangeLength,
		};
		source =
			source.slice(0, offset) + text + source.slice(offset + rangeLength);
		version++;
		emit('change', {
			versionId: version,
			changes: [{ text, rangeLength, range }],
			isFlush: false,
			isUndoing: false,
			isRedoing: false,
		});
		position = {
			lineNumber: initial.lineNumber,
			column: initial.column + text.length,
		};
	};
	return {
		editor,
		model,
		controller,
		bind,
		emit,
		keyDown,
		insert,
		tokenize,
		initial,
	};
}
const action = [
	'natural-middle-completion',
	'editor.action.triggerSuggest',
	{},
];
describe('natural word-middle completion through public editor events', () => {
	beforeEach(() => vi.clearAllMocks());
	it.each([
		{
			name: 'class import',
			marked: '<?php\nuse Vendor\\{Wi|get};',
			key: 'd',
			tail: 3,
		},
		{
			name: 'function import',
			marked: '<?php\nuse Vendor\\{function wo|k};',
			key: 'r',
			tail: 1,
		},
	])(
		'triggers once for $name and tokenizes the complete document',
		async ({ marked, key, tail }) => {
			// Arrange
			const sut = scene(marked, 'identifier.php', tail);
			sut.bind();
			// Act
			sut.keyDown(key);
			sut.insert(key);
			await Promise.resolve();
			// Assert
			expect({
				requests: sut.editor.trigger.mock.calls,
				tokenizations: sut.tokenize.mock.calls,
			}).toEqual({
				requests: [action],
				tokenizations: [[marked.replace('|', key), 'php']],
			});
		}
	);
	it.each([
		{
			name: 'line comment',
			marked: '<?php\n// Wi|get',
			type: 'comment.php',
		},
		{
			name: 'multiline comment',
			marked: '<?php\n/* open\nWi|get\n*/',
			type: 'comment.php',
		},
		{
			name: 'single quoted string',
			marked: "<?php\n$s='Wi|get';",
			type: 'string.php',
		},
		{
			name: 'multiline string',
			marked: '<?php\n$s="open\nWi|get\n";',
			type: 'string.php',
		},
		{ name: 'HTML', marked: '<div>Wi|get</div>', type: '' },
		// Real CDN0.55.1 reports identifier.php for these bodies; they must still be excluded.
		{
			name: 'heredoc',
			marked: '<?php\n$s=<<<TXT\nWi|get\nTXT;',
			type: 'identifier.php',
		},
		{
			name: 'nowdoc',
			marked: "<?php\n$s=<<<'TXT'\nWi|get\nTXT;",
			type: 'identifier.php',
		},
	])('does not request inside $name', async ({ marked, type }) => {
		// Arrange
		const sut = scene(marked, type);
		if (type === 'identifier.php')
			sut.tokenize.mockReturnValue([
				[{ offset: 0, type: 'metatag.php', language: 'php' }],
				[
					{ offset: 0, type: 'variable.php', language: 'php' },
					{ offset: 2, type: 'delimiter.php', language: 'php' },
					{ offset: 6, type: 'string.php', language: 'php' },
				],
				[{ offset: 0, type: 'identifier.php', language: 'php' }],
				[{ offset: 0, type: 'identifier.php', language: 'php' }],
			]);
		sut.bind();
		// Act
		sut.keyDown('d');
		sut.insert('d');
		await Promise.resolve();
		// Assert
		expect(sut.editor.trigger.mock.calls).toEqual([]);
	});
	it.each([
		'off',
		'version change',
		'unmount',
		'model change',
		'composition',
		'selection',
		'paste',
		'deletion',
		'programmatic',
		'ordinary word end',
		'stale document',
		'open widget',
		'blur',
		'multi cursor',
	])('does not add a request for %s', async (kind) => {
		// Arrange
		const sut = scene('<?php\nnew Wi|get;');
		const binding = sut.bind();
		if (kind === 'off' || kind === 'version change') sut.controller.abort();
		if (kind === 'unmount') binding.dispose();
		if (kind === 'model change') sut.emit('modelChange');
		if (kind === 'composition') sut.emit('compositionStart');
		if (kind === 'selection')
			sut.editor.getSelections = () => [{ isEmpty: () => false }];
		if (kind === 'multi cursor')
			sut.editor.getSelections = () => [
				{ isEmpty: () => true },
				{ isEmpty: () => true },
			];
		if (kind === 'ordinary word end')
			sut.model.getWordAtPosition = () => ({
				word: 'Wi',
				startColumn: sut.initial.column - 2,
				endColumn: sut.initial.column,
			});
		if (kind === 'open widget') {
			const widget = {
				getBoundingClientRect: () => ({ width: 430, height: 20 }),
				ownerDocument: {
					defaultView: {
						getComputedStyle: () => ({
							display: 'block',
							visibility: 'visible',
						}),
					},
				},
			};
			const elements = new Map([['.suggest-widget', widget]]);
			sut.editor.getDomNode = () => ({
				querySelector: (selector: string) =>
					elements.get(selector) ?? null,
			});
		}

		// Act
		if (kind !== 'programmatic')
			sut.keyDown('d', kind === 'paste' ? { ctrlKey: true } : {});
		if (kind === 'blur') sut.emit('blur');
		sut.insert(
			kind === 'paste' ? 'Widget' : kind === 'deletion' ? '' : 'd',
			kind === 'deletion' ? 1 : 0
		);
		if (kind === 'stale document') sut.insert('x');
		await Promise.resolve();
		// Assert
		expect(sut.editor.trigger.mock.calls).toEqual([]);
	});
	it('rebinds after a version switch without retaining the old subscription', async () => {
		// Arrange
		const old = scene('<?php\nnew Wi|get;');
		old.bind();
		old.keyDown('d');
		old.insert('d');
		old.controller.abort();
		const sut = scene('<?php\nnew Wi|get;');
		sut.bind();
		// Act
		sut.keyDown('d');
		sut.insert('d');
		await Promise.resolve();
		// Assert
		expect({
			old: old.editor.trigger.mock.calls,
			current: sut.editor.trigger.mock.calls,
		}).toEqual({ old: [], current: [action] });
	});
	it.each([
		'abort',
		'model replacement',
		'editor disposal',
		'selection change',
	])('suppresses queued work after %s', async (kind) => {
		// Arrange
		const sut = scene('<?php\nnew Wi|get;');
		sut.bind();
		// Act
		sut.keyDown('d');
		sut.insert('d');
		if (kind === 'abort') sut.controller.abort();
		if (kind === 'model replacement')
			sut.editor.getModel = () => ({ ...sut.model });
		if (kind === 'editor disposal') sut.emit('dispose');
		if (kind === 'selection change')
			sut.editor.getSelections = () => [{ isEmpty: () => false }];
		await Promise.resolve();
		// Assert
		expect(sut.editor.trigger.mock.calls).toEqual([]);
	});
	it.each(['é', '😀'])(
		'preserves a single PHP identifier insertion %s in UTF16 positions',
		async (key) => {
			// Arrange
			const sut = scene('<?php\nnew Wi|get;');
			sut.bind();
			// Act
			sut.keyDown(key);
			sut.insert(key);
			await Promise.resolve();
			// Assert
			expect(sut.editor.trigger.mock.calls).toEqual([action]);
		}
	);
	it('does not tokenize an ordinary word-end insertion', async () => {
		// Arrange
		const sut = scene('<?php\nnew Wi|;', 'identifier.php', 0);
		sut.bind();
		// Act
		sut.keyDown('d');
		sut.insert('d');
		await Promise.resolve();
		// Assert
		expect({
			requests: sut.editor.trigger.mock.calls,
			tokens: sut.tokenize.mock.calls,
		}).toEqual({ requests: [], tokens: [] });
	});
	it('suppresses completion if public tokenization fails', async () => {
		// Arrange
		const sut = scene('<?php\nnew Wi|get;');
		sut.tokenize.mockImplementation(() => {
			throw new Error('tokenizer unavailable');
		});
		sut.bind();
		// Act
		sut.keyDown('d');
		sut.insert('d');
		await Promise.resolve();
		// Assert
		expect(sut.editor.trigger.mock.calls).toEqual([]);
	});
	it('suppresses natural completion inside backtick execution strings', async () => {
		// Arrange: actual CDN0.55.1 classifies this word as identifier.php.
		const sut = scene('<?php\n$x=`Wi|get`; echo "ok";', 'identifier.php');
		sut.bind();
		// Act
		sut.keyDown('d');
		sut.insert('d');
		await Promise.resolve();
		// Assert
		expect(sut.editor.trigger.mock.calls).toEqual([]);
	});
	it('naturally requests PHP8 attribute code despite the CDN comment token', async () => {
		// Arrange: actual CDN0.55.1 classifies #[ through EOL as comment.php.
		const sut = scene('<?php\n#[Wi|get] class Example {}', 'comment.php');
		const original = '<?php\n#[Widget] class Example {}';
		const prepared = '<?php\n [Widget] class Example {}';
		const observedTokens = new Map([
			[
				original,
				[
					[{ offset: 0, type: 'metatag.php', language: 'php' }],
					[{ offset: 0, type: 'comment.php', language: 'php' }],
				],
			],
			[
				prepared,
				[
					[{ offset: 0, type: 'metatag.php', language: 'php' }],
					[{ offset: 0, type: 'identifier.php', language: 'php' }],
				],
			],
		]);
		sut.tokenize.mockImplementation((text) => observedTokens.get(text)!);

		sut.bind();
		// Act
		sut.keyDown('d');
		sut.insert('d');
		await Promise.resolve();
		// Assert
		expect(sut.editor.trigger.mock.calls).toEqual([action]);
	});
	it('keeps an existing pinned-CDN popup interaction even if it hides during the edit turn', async () => {
		// Arrange: real CDN0.55.1 widget has no .visible class; its DOM box/style is visible.
		const sut = scene('<?php\nnew Wi|get;');
		let visible = true;
		const widget = {
			getBoundingClientRect: () => ({ width: 430, height: 20 }),
			ownerDocument: {
				defaultView: {
					getComputedStyle: () => ({
						display: visible ? 'block' : 'none',
						visibility: 'visible',
					}),
				},
			},
		};
		const elements = new Map([['.suggest-widget', widget]]);
		sut.editor.getDomNode = () => ({
			querySelector: (selector: string) => elements.get(selector) ?? null,
		});
		sut.bind();
		// Act
		sut.keyDown('d');
		visible = false;
		sut.insert('d');
		await Promise.resolve();
		// Assert
		expect(sut.editor.trigger.mock.calls).toEqual([]);
	});
});
