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

class TestCancellationToken {
	isCancellationRequested = false;
	private readonly listeners = new Set<() => void>();

	onCancellationRequested(listener: () => void): Monaco.IDisposable {
		this.listeners.add(listener);
		return { dispose: () => this.listeners.delete(listener) };
	}

	cancel(): void {
		this.isCancellationRequested = true;
		for (const listener of this.listeners) listener();
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
	let text = value;
	const changeListeners = new Set<() => void>();
	const model = {
		uri: { toString: () => 'inmemory://model/preview.php' },
		getValue: () => text,
		getLineContent: () => text,
		getVersionId: () => version,
		onDidChangeContent: (listener: () => void) => {
			changeListeners.add(listener);
			return { dispose: () => changeListeners.delete(listener) };
		},
		getWordUntilPosition: () => word,
	};
	return {
		model: model as unknown as Monaco.editor.ITextModel,
		change: (nextText?: string) => {
			if (nextText !== undefined) text = nextText;
			version++;
			for (const listener of changeListeners) listener();
		},
	};
}

describe('Phpactor Monaco lifecycle', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

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

	it('settles a quick-suggest Invoke on the latest document and cursor before sending one request', async () => {
		vi.useFakeTimers();
		const source = "<?php $hello = 'world'; $hel";
		const document = testModel(source, {
			startColumn: 26,
			endColumn: 29,
		});
		const monaco = testMonaco(document.model);
		const worker = new TestWorker();
		let cursor = { lineNumber: 1, column: 29 } as Monaco.Position;
		const sut = await LspClient.connect({
			worker: worker as unknown as Worker,
			model: document.model,
			monaco: monaco.monaco,
			phpVersion: '8.5',
			getPosition: () => cursor,
			onStatus: vi.fn(),
		});
		const provider = monaco.getActive()[0]
			.provider as Monaco.languages.CompletionItemProvider;
		const pending = provider.provideCompletionItems(
			document.model,
			{ lineNumber: 1, column: 7 } as Monaco.Position,
			{ triggerKind: 0 },
			new TestCancellationToken() as unknown as Monaco.CancellationToken
		);

		document.change(`${source}s`);
		await vi.advanceTimersByTimeAsync(80);
		document.change(`${source}tr`);
		await vi.advanceTimersByTimeAsync(80);
		document.change(`${source}tr_`);
		cursor = { lineNumber: 1, column: 32 } as Monaco.Position;
		await vi.advanceTimersByTimeAsync(99);
		expect(
			worker.sent.filter(
				(message) => message.method === 'textDocument/completion'
			)
		).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(1);
		const result = await pending;

		const request = worker.lastCompletion;
		expect(request?.params).toMatchObject({
			position: { line: 0, character: 31 },
		});
		expect(result?.suggestions).toHaveLength(1);
		sut.dispose();
	});

	it('re-requests the latest quick-suggest version after an earlier trigger is cancelled', async () => {
		vi.useFakeTimers();
		const document = testModel('<?php\ns');
		const monaco = testMonaco(document.model);
		const worker = new TestWorker();
		let cursor = { lineNumber: 2, column: 2 } as Monaco.Position;
		const sut = await LspClient.connect({
			worker: worker as unknown as Worker,
			model: document.model,
			monaco: monaco.monaco,
			phpVersion: '8.5',
			getPosition: () => cursor,
			onStatus: vi.fn(),
		});
		const provider = monaco.getActive()[0]
			.provider as Monaco.languages.CompletionItemProvider;
		const firstToken = new TestCancellationToken();
		const first = provider.provideCompletionItems(
			document.model,
			{ lineNumber: 2, column: 2 } as Monaco.Position,
			{ triggerKind: 0 },
			firstToken as unknown as Monaco.CancellationToken
		);
		document.change('<?php\nst');
		firstToken.cancel();
		expect(await first).toEqual({ suggestions: [] });

		const latest = provider.provideCompletionItems(
			document.model,
			{ lineNumber: 2, column: 3 } as Monaco.Position,
			{ triggerKind: 0 },
			new TestCancellationToken() as unknown as Monaco.CancellationToken
		);
		document.change('<?php\nstr_');
		cursor = { lineNumber: 2, column: 5 } as Monaco.Position;
		await vi.advanceTimersByTimeAsync(100);

		const completion = worker.sent.filter(
			(message) => message.method === 'textDocument/completion'
		);
		expect(completion).toHaveLength(1);
		expect(completion[0]?.params).toMatchObject({
			position: { line: 1, character: 4 },
		});
		expect(await latest).toMatchObject({
			suggestions: [{ label: 'fresh' }],
		});
		sut.dispose();
	});

	it('retriggers Monaco quick suggestions after an automatic response becomes stale', async () => {
		vi.useFakeTimers();
		const document = testModel('<?php\ns');
		const monaco = testMonaco(document.model);
		const worker = new TestWorker();
		worker.delayCompletions = true;
		const triggerCompletion = vi.fn();
		const sut = await LspClient.connect({
			worker: worker as unknown as Worker,
			model: document.model,
			monaco: monaco.monaco,
			phpVersion: '8.5',
			triggerCompletion,
			onStatus: vi.fn(),
		});
		const provider = monaco.getActive()[0]
			.provider as Monaco.languages.CompletionItemProvider;
		const pending = provider.provideCompletionItems(
			document.model,
			{ lineNumber: 2, column: 2 } as Monaco.Position,
			{ triggerKind: 0 },
			new TestCancellationToken() as unknown as Monaco.CancellationToken
		);
		await vi.advanceTimersByTimeAsync(100);
		const request = worker.lastCompletion;
		document.change('<?php\nst');
		worker.reply({
			jsonrpc: '2.0',
			id: request?.id,
			result: { items: [{ label: 'stale' }] },
		});
		expect(await pending).toEqual({ suggestions: [] });
		await vi.advanceTimersByTimeAsync(99);
		expect(triggerCompletion).not.toHaveBeenCalled();
		document.change('<?php\nstr_');
		await vi.advanceTimersByTimeAsync(99);
		expect(triggerCompletion).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(triggerCompletion).toHaveBeenCalledTimes(1);
		sut.dispose();
	});

	it('does not send a cancelled automatic trigger or surface it as an error', async () => {
		vi.useFakeTimers();
		const document = testModel();
		const monaco = testMonaco(document.model);
		const worker = new TestWorker();
		const onStatus = vi.fn();
		const triggerCompletion = vi.fn();
		const sut = await LspClient.connect({
			worker: worker as unknown as Worker,
			model: document.model,
			monaco: monaco.monaco,
			phpVersion: '8.5',
			triggerCompletion,
			onStatus,
		});
		const provider = monaco.getActive()[0]
			.provider as Monaco.languages.CompletionItemProvider;
		const token = new TestCancellationToken();
		const pending = provider.provideCompletionItems(
			document.model,
			{ lineNumber: 1, column: 7 } as Monaco.Position,
			{ triggerKind: 1, triggerCharacter: '$' },
			token as unknown as Monaco.CancellationToken
		);

		document.change('<?php $widget->x');
		token.cancel();
		expect(await pending).toEqual({ suggestions: [] });
		sut.dispose();
		await vi.advanceTimersByTimeAsync(100);
		expect(
			worker.sent.some(
				(message) => message.method === 'textDocument/completion'
			)
		).toBe(false);
		expect(triggerCompletion).not.toHaveBeenCalled();
		expect(onStatus).not.toHaveBeenCalledWith('error', expect.anything());
	});

	it('keeps only the latest automatic request behind an in-flight completion', async () => {
		vi.useFakeTimers();
		const document = testModel();
		const monaco = testMonaco(document.model);
		const worker = new TestWorker();
		worker.delayCompletions = true;
		const sut = await LspClient.connect({
			worker: worker as unknown as Worker,
			model: document.model,
			monaco: monaco.monaco,
			phpVersion: '8.5',
			onStatus: vi.fn(),
		});
		const provider = monaco.getActive()[0]
			.provider as Monaco.languages.CompletionItemProvider;
		const context = { triggerKind: 1, triggerCharacter: '$' };
		const token = () =>
			new TestCancellationToken() as unknown as Monaco.CancellationToken;
		const invoke = () =>
			provider.provideCompletionItems(
				document.model,
				{ lineNumber: 1, column: 7 } as Monaco.Position,
				context,
				token()
			);

		const first = invoke();
		await vi.advanceTimersByTimeAsync(100);
		expect(worker.lastCompletion).toBeDefined();
		const superseded = invoke();
		await vi.advanceTimersByTimeAsync(100);
		const latest = invoke();
		await vi.advanceTimersByTimeAsync(100);
		expect(
			worker.sent.filter(
				(message) => message.method === 'textDocument/completion'
			)
		).toHaveLength(1);

		worker.delayCompletions = false;
		worker.reply({
			jsonrpc: '2.0',
			id: worker.lastCompletion?.id,
			result: { items: [{ label: 'first' }] },
		});
		await first;
		expect(await superseded).toEqual({ suggestions: [] });
		await latest;
		expect(
			worker.sent.filter(
				(message) => message.method === 'textDocument/completion'
			)
		).toHaveLength(2);
		sut.dispose();
	});

	it('dispatches a marked manual Invoke immediately and lets a cancelled request finish without an error', async () => {
		const document = testModel();
		const monaco = testMonaco(document.model);
		const worker = new TestWorker();
		worker.delayCompletions = true;
		const onStatus = vi.fn();
		const sut = await LspClient.connect({
			worker: worker as unknown as Worker,
			model: document.model,
			monaco: monaco.monaco,
			phpVersion: '8.5',
			consumeManualCompletionShortcut: () => true,
			onStatus,
		});
		const provider = monaco.getActive()[0]
			.provider as Monaco.languages.CompletionItemProvider;
		const token = new TestCancellationToken();
		const pending = provider.provideCompletionItems(
			document.model,
			{ lineNumber: 1, column: 5 } as Monaco.Position,
			{ triggerKind: 0 },
			token as unknown as Monaco.CancellationToken
		);

		expect(worker.lastCompletion).toBeDefined();
		token.cancel();
		expect(await pending).toEqual({ suggestions: [] });
		worker.reply({
			jsonrpc: '2.0',
			id: worker.lastCompletion?.id,
			result: { items: [{ label: 'late' }] },
		});
		await Promise.resolve();
		expect(onStatus).not.toHaveBeenCalledWith('error', expect.anything());
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
			consumeManualCompletionShortcut: () => true,
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
			{ triggerKind: 0 },
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
