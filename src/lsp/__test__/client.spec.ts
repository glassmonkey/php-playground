// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Monaco from 'monaco-editor';
import type { Version } from '../../php-wasm/php';
import { LspClient } from '../client';
import { phpVersionInitializationError } from '../phpantom/php-version.mjs';
import { reviewedPhpVersions } from '../phpantom/artifact-registry';

type RpcMessage = {
	jsonrpc: '2.0';
	id?: number;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: { code: number; message: string };
};

function initializationOptions(message: RpcMessage): unknown {
	if (
		typeof message.params !== 'object' ||
		message.params === null ||
		Array.isArray(message.params)
	) {
		return undefined;
	}
	return (message.params as Record<string, unknown>).initializationOptions;
}

class TestWorker {
	readonly sent: RpcMessage[] = [];
	readonly listeners = new Map<string, EventListener[]>();
	terminated = false;
	delayCompletions = false;
	lastCompletion: RpcMessage | undefined;
	completionResult: unknown = { items: [{ label: 'fresh' }] };

	addEventListener(type: string, listener: EventListener): void {
		this.listeners.set(type, [
			...(this.listeners.get(type) ?? []),
			listener,
		]);
	}

	removeEventListener(type: string, listener: EventListener): void {
		this.listeners.set(
			type,
			(this.listeners.get(type) ?? []).filter(
				(registered) => registered !== listener
			)
		);
	}

	postMessage(message: RpcMessage): void {
		this.sent.push(message);
		if (message.method === 'initialize') {
			const reason = phpVersionInitializationError(
				initializationOptions(message),
				reviewedPhpVersions()
			);
			queueMicrotask(() =>
				this.reply({
					jsonrpc: '2.0',
					id: message.id,
					...(reason
						? { error: { code: -32602, message: reason } }
						: { result: { capabilities: {} } }),
				})
			);
		} else if (message.method === 'textDocument/completion') {
			this.lastCompletion = message;
			if (!this.delayCompletions) {
				queueMicrotask(() =>
					this.reply({
						jsonrpc: '2.0',
						id: message.id,
						result: this.completionResult,
					})
				);
			}
		}
	}

	reply(message: RpcMessage): void {
		const event = new MessageEvent('message', { data: message });
		for (const listener of this.listeners.get('message') ?? [])
			listener(event);
	}

	terminate(): void {
		this.terminated = true;
	}
}

function testMonaco(model: Monaco.editor.ITextModel) {
	const registrations: Array<{ provider: unknown; disposed: boolean }> = [];
	const register = (provider: unknown) => {
		const registration = { provider, disposed: false };
		registrations.push(registration);
		return { dispose: () => (registration.disposed = true) };
	};
	const monaco = {
		languages: {
			CompletionItemKind: Object.fromEntries(
				[
					'Text',
					'Method',
					'Function',
					'Constructor',
					'Field',
					'Variable',
					'Class',
					'Interface',
					'Module',
					'Property',
					'Unit',
					'Value',
					'Enum',
					'Keyword',
					'Snippet',
					'Color',
					'File',
					'Reference',
					'Folder',
					'EnumMember',
					'Constant',
					'Struct',
					'Event',
					'Operator',
					'TypeParameter',
				].map((name, index) => [name, index])
			),
			CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
			registerCompletionItemProvider: (
				_selector: unknown,
				provider: unknown
			) => register(provider),
			registerHoverProvider: (_selector: unknown, provider: unknown) =>
				register(provider),
			registerSignatureHelpProvider: (
				_selector: unknown,
				provider: unknown
			) => register(provider),
		},
	} as unknown as typeof Monaco;
	return {
		monaco,
		registrations,
		getActive: () => registrations.filter((item) => !item.disposed),
		model,
	};
}

function testModel() {
	let version = 1;
	let changeListener: (() => void) | undefined;
	const model = {
		uri: { toString: () => 'inmemory://model/preview.php' },
		getValue: () => '<?php $widget->',
		getVersionId: () => version,
		onDidChangeContent: (listener: () => void) => {
			changeListener = listener;
			return { dispose: () => (changeListener = undefined) };
		},
		getWordUntilPosition: (position: Monaco.Position) => ({
			startColumn: Math.max(1, position.column - 4),
			endColumn: position.column,
		}),
	};
	return {
		model: model as unknown as Monaco.editor.ITextModel,
		change: () => {
			version++;
			changeListener?.();
		},
	};
}

function testCancellationToken() {
	let cancelled = false;
	const listeners = new Set<() => void>();
	return {
		token: {
			get isCancellationRequested() {
				return cancelled;
			},
			onCancellationRequested: (listener: () => void) => {
				listeners.add(listener);
				return { dispose: () => listeners.delete(listener) };
			},
		} as Monaco.CancellationToken,
		cancel: () => {
			cancelled = true;
			for (const listener of listeners) listener();
			listeners.clear();
		},
	};
}

describe('PHPantom Monaco lifecycle', () => {
	afterEach(() => vi.restoreAllMocks());

	it('preserves PHPantom snippet and variable edit completion shapes', async () => {
		// Arrange
		const document = testModel();
		const monaco = testMonaco(document.model);
		const worker = new TestWorker();
		worker.completionResult = {
			items: [
				{
					label: 'strlen',
					filterText: 'strlen',
					insertText: 'strlen()$0',
					insertTextFormat: 2,
					kind: 3,
				},
				{
					label: 'greetUser($name)',
					filterText: 'greetUser',
					sortText: 'b00_greetuser',
					insertText: 'greetUser(${1:\\$name})$0',
					insertTextFormat: 2,
					kind: 3,
				},
				{
					label: '$greeting',
					filterText: '$greeting',
					kind: 6,
					textEdit: {
						range: {
							start: { line: 2, character: 5 },
							end: { line: 2, character: 9 },
						},
						newText: '$greeting',
					},
				},
			],
		};
		const client = await LspClient.connect({
			worker: worker as unknown as Worker,
			model: document.model,
			monaco: monaco.monaco,
			phpVersion: '8.5',
			onStatus: vi.fn(),
		});

		const provider = monaco.getActive()[0]
			.provider as Monaco.languages.CompletionItemProvider;

		// Act
		const result = await provider.provideCompletionItems(
			document.model,
			{ lineNumber: 3, column: 10 } as Monaco.Position,
			{ triggerKind: 1, triggerCharacter: undefined },
			{
				isCancellationRequested: false,
				onCancellationRequested: () => ({ dispose: () => undefined }),
			}
		);
		const suggestions: Monaco.languages.CompletionItem[] = Array.isArray(
			result
		)
			? result
			: (result?.suggestions ?? []);
		const got = suggestions.map(
			({
				label,
				filterText,
				sortText,
				insertText,
				insertTextRules,
				range,
			}) => ({
				label,
				filterText,
				sortText,
				insertText,
				insertTextRules,
				range,
			})
		);
		const want = [
			{
				label: 'strlen',
				filterText: 'strlen',
				sortText: undefined,
				insertText: 'strlen()$0',
				insertTextRules: 4,
				range: {
					startLineNumber: 3,
					startColumn: 6,
					endLineNumber: 3,
					endColumn: 10,
				},
			},
			{
				label: 'greetUser($name)',
				filterText: 'greetUser',
				sortText: 'b00_greetuser',
				insertText: 'greetUser(${1:\\$name})$0',
				insertTextRules: 4,
				range: {
					startLineNumber: 3,
					startColumn: 6,
					endLineNumber: 3,
					endColumn: 10,
				},
			},
			{
				label: '$greeting',
				filterText: '$greeting',
				sortText: undefined,
				insertText: '$greeting',
				insertTextRules: undefined,
				range: {
					startLineNumber: 3,
					startColumn: 6,
					endLineNumber: 3,
					endColumn: 10,
				},
			},
		];

		// Assert
		expect(got).toEqual(want);

		client.dispose();
	});

	it('disposes providers on off/8.6 and initializes a fresh PHP 8.5 client when re-enabled', async () => {
		const document = testModel();
		const monaco = testMonaco(document.model);
		const firstWorker = new TestWorker();
		const firstClient = await LspClient.connect({
			worker: firstWorker as unknown as Worker,
			model: document.model,
			monaco: monaco.monaco,
			phpVersion: '8.5',
			onStatus: vi.fn(),
		});

		expect(initializationOptions(firstWorker.sent[0])).toEqual({
			phpVersion: '8.5',
		});
		expect(monaco.getActive()).toHaveLength(3);

		firstWorker.delayCompletions = true;
		const completionProvider = monaco.getActive()[0]
			.provider as Monaco.languages.CompletionItemProvider;
		const pending = completionProvider.provideCompletionItems(
			document.model,
			{ lineNumber: 1, column: 5 } as Monaco.Position,
			{ triggerKind: 1, triggerCharacter: undefined },
			{
				isCancellationRequested: false,
				onCancellationRequested: () => ({ dispose: () => undefined }),
			}
		);
		document.change();
		firstWorker.reply({
			jsonrpc: '2.0',
			id: firstWorker.lastCompletion?.id,
			result: { items: [{ label: 'stale' }] },
		});
		expect(await pending).toEqual({ suggestions: [] });

		firstClient.dispose(); // Turning the toggle off removes all three providers.
		expect(monaco.getActive()).toHaveLength(0);
		expect(
			firstWorker.sent.some(
				(message) => message.method === 'textDocument/didClose'
			)
		).toBe(true);
		expect(firstWorker.terminated).toBe(true);

		const unsupportedWorker = new TestWorker();
		await expect(
			LspClient.connect({
				worker: unsupportedWorker as unknown as Worker,
				model: document.model,
				monaco: monaco.monaco,
				phpVersion: '8.6' as Version,
				onStatus: vi.fn(),
			})
		).rejects.toThrow(/received 8\.6/i);
		expect(initializationOptions(unsupportedWorker.sent[0])).toEqual({
			phpVersion: '8.6',
		});
		expect(monaco.getActive()).toHaveLength(0);
		expect(unsupportedWorker.terminated).toBe(true);

		const restoredWorker = new TestWorker();
		const restoredClient = await LspClient.connect({
			worker: restoredWorker as unknown as Worker,
			model: document.model,
			monaco: monaco.monaco,
			phpVersion: '8.5',
			onStatus: vi.fn(),
		});
		expect(initializationOptions(restoredWorker.sent[0])).toEqual({
			phpVersion: '8.5',
		});
		expect(monaco.getActive()).toHaveLength(3);

		restoredClient.dispose();
		expect(monaco.getActive()).toHaveLength(0);
	});

	it('rejects a PHP release without a reviewed PHPantom artifact even when PHP is supported by the app', async () => {
		const document = testModel();
		const monaco = testMonaco(document.model);
		const worker = new TestWorker();

		await expect(
			LspClient.connect({
				worker: worker as unknown as Worker,
				model: document.model,
				monaco: monaco.monaco,
				phpVersion: '8.4',
				onStatus: vi.fn(),
			})
		).rejects.toThrow(/supports PHP versions 7\.4, 8\.0, 8\.3, 8\.5/);
		expect(monaco.getActive()).toHaveLength(0);
		expect(worker.terminated).toBe(true);
	});

	it('settles a cancelled completion before its late LSP response', async () => {
		const document = testModel();
		const monaco = testMonaco(document.model);
		const worker = new TestWorker();
		worker.delayCompletions = true;
		const onStatus = vi.fn();
		const client = await LspClient.connect({
			worker: worker as unknown as Worker,
			model: document.model,
			monaco: monaco.monaco,
			phpVersion: '8.5',
			onStatus,
		});
		const token = testCancellationToken();
		const provider = monaco.getActive()[0]
			.provider as Monaco.languages.CompletionItemProvider;
		const pending = provider.provideCompletionItems(
			document.model,
			{ lineNumber: 1, column: 5 } as Monaco.Position,
			{ triggerKind: 1, triggerCharacter: undefined },
			token.token
		);

		token.cancel();

		await expect(pending).resolves.toEqual({ suggestions: [] });
		worker.reply({
			jsonrpc: '2.0',
			id: worker.lastCompletion?.id,
			result: { items: [{ label: 'late stale result' }] },
		});
		expect(onStatus).toHaveBeenCalledTimes(1);
		expect(onStatus).toHaveBeenLastCalledWith('ready');
		client.dispose();
	});

	it('reports an active completion backend error instead of treating it as cancellation', async () => {
		const document = testModel();
		const monaco = testMonaco(document.model);
		const worker = new TestWorker();
		worker.delayCompletions = true;
		const onStatus = vi.fn();
		const client = await LspClient.connect({
			worker: worker as unknown as Worker,
			model: document.model,
			monaco: monaco.monaco,
			phpVersion: '8.5',
			onStatus,
		});
		const provider = monaco.getActive()[0]
			.provider as Monaco.languages.CompletionItemProvider;
		const pending = provider.provideCompletionItems(
			document.model,
			{ lineNumber: 1, column: 5 } as Monaco.Position,
			{ triggerKind: 1, triggerCharacter: undefined },
			{
				isCancellationRequested: false,
				onCancellationRequested: () => ({ dispose: () => undefined }),
			}
		);
		worker.reply({
			jsonrpc: '2.0',
			id: worker.lastCompletion?.id,
			error: { code: -32603, message: 'PHPantom completion failed.' },
		});

		await expect(pending).resolves.toEqual({ suggestions: [] });
		expect(onStatus).toHaveBeenCalledWith(
			'error',
			'PHPantom completion failed.'
		);
		client.dispose();
	});
});
