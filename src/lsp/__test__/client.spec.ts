// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Monaco from 'monaco-editor';
import { LspClient } from '../client';

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
			queueMicrotask(() =>
				this.reply({
					jsonrpc: '2.0',
					id: message.id,
					result: { capabilities: {} },
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

function testModel(
	value = '<?php $widget->',
	word = { startColumn: 1, endColumn: 1 }
) {
	let version = 1;
	let changeListener: (() => void) | undefined;
	const model = {
		uri: { toString: () => 'inmemory://model/preview.php' },
		getValue: () => value,
		getLineContent: () => value,
		getVersionId: () => version,
		onDidChangeContent: (listener: () => void) => {
			changeListener = listener;
			return { dispose: () => (changeListener = undefined) };
		},
		getWordUntilPosition: () => word,
	};
	return {
		model: model as unknown as Monaco.editor.ITextModel,
		change: () => {
			version++;
			changeListener?.();
		},
	};
}

describe('Phpactor Monaco lifecycle', () => {
	afterEach(() => vi.restoreAllMocks());

	it('replaces a typed dollar-prefixed variable from Phpactor insertText without duplicating $', async () => {
		const source = "<?php $hello = 'world'; $hel";
		const document = testModel(source, {
			startColumn: 26,
			endColumn: 29,
		});
		const monaco = testMonaco(document.model);
		const worker = new TestWorker();
		worker.completionResult = {
			items: [{ label: '$hello', insertText: '$hello', kind: 6 }],
		};
		const sut = await LspClient.connect({
			worker: worker as unknown as Worker,
			model: document.model,
			monaco: monaco.monaco,
			phpVersion: '8.5',
			onStatus: vi.fn(),
		});
		const provider = monaco.getActive()[0]
			.provider as Monaco.languages.CompletionItemProvider;

		const result = await provider.provideCompletionItems(
			document.model,
			{ lineNumber: 1, column: 29 } as Monaco.Position,
			{ triggerKind: 1, triggerCharacter: undefined },
			{
				isCancellationRequested: false,
				onCancellationRequested: () => ({ dispose: () => undefined }),
			}
		);

		expect(result?.suggestions[0]).toMatchObject({
			label: '$hello',
			insertText: '$hello',
			range: {
				startLineNumber: 1,
				startColumn: 25,
				endLineNumber: 1,
				endColumn: 29,
			},
		});
		sut.dispose();
	});

	it('sends the selected analysis version and replaces providers when reinitialized', async () => {
		const document = testModel();
		const monaco = testMonaco(document.model);
		const firstWorker = new TestWorker();
		const sut = await LspClient.connect({
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

		sut.dispose(); // Turning the toggle off removes all three providers.
		expect(monaco.getActive()).toHaveLength(0);
		expect(
			firstWorker.sent.some(
				(message) => message.method === 'textDocument/didClose'
			)
		).toBe(true);
		expect(firstWorker.terminated).toBe(true);

		const php84Worker = new TestWorker();
		const php84Client = await LspClient.connect({
			worker: php84Worker as unknown as Worker,
			model: document.model,
			monaco: monaco.monaco,
			phpVersion: '8.4',
			onStatus: vi.fn(),
		});
		expect(initializationOptions(php84Worker.sent[0])).toEqual({
			phpVersion: '8.4',
		});
		php84Client.dispose();
		expect(monaco.getActive()).toHaveLength(0);

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
});
