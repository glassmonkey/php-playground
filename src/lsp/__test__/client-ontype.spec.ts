// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type * as Monaco from 'monaco-editor';
import { LspClient } from '../client';

type Message = {
	jsonrpc: '2.0';
	id?: number;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: { code: number; message: string };
};

class FormattingWorker extends EventTarget {
	readonly sent: Message[] = [];
	terminated = false;
	deferFormatting = false;
	result: unknown = [];
	failure: Message['error'];
	constructor(readonly capability: unknown) {
		super();
	}
	postMessage(message: Message) {
		this.sent.push(message);
		if (message.method === 'initialize') {
			queueMicrotask(() =>
				this.reply({
					jsonrpc: '2.0',
					id: message.id,
					result: {
						capabilities: {
							documentOnTypeFormattingProvider: this.capability,
						},
					},
				})
			);
		}
		if (
			message.method === 'textDocument/onTypeFormatting' &&
			!this.deferFormatting
		) {
			queueMicrotask(() =>
				this.reply({
					jsonrpc: '2.0',
					id: message.id,
					...(this.failure
						? { error: this.failure }
						: { result: this.result }),
				})
			);
		}
	}
	reply(message: Message) {
		this.dispatchEvent(new MessageEvent('message', { data: message }));
	}
	terminate() {
		this.terminated = true;
	}
}

function fixture(
	configuration: { capability: unknown } = {
		capability: { firstTriggerCharacter: '\n' },
	},
	path = '/active.php'
) {
	let text =
		'<?php\n/* 🐈 */\n/**\n\nfunction greet($name): string { return $name; }\n';
	let version = 1,
		closed = false,
		language = 'php';
	const changes = new Set<() => void>(),
		closes = new Set<() => void>();
	const model = {
		uri: {
			scheme: 'inmemory',
			path,
			toString: () => `inmemory://model${path}`,
		},
		getValue: () => text,
		getVersionId: () => version,
		getLanguageId: () => language,
		isDisposed: () => closed,
		onDidChangeContent: (listener: () => void) => {
			changes.add(listener);
			return { dispose: () => changes.delete(listener) };
		},
		onWillDispose: (listener: () => void) => {
			closes.add(listener);
			return { dispose: () => closes.delete(listener) };
		},
	} as unknown as Monaco.editor.ITextModel;
	const registrations: Array<{
		kind: string;
		selector: Monaco.languages.LanguageSelector;
		provider: unknown;
		disposed: boolean;
	}> = [];
	const register = (
		kind: string,
		selector: Monaco.languages.LanguageSelector,
		provider: unknown
	) => {
		const entry = { kind, selector, provider, disposed: false };
		registrations.push(entry);
		return {
			dispose: () => {
				entry.disposed = true;
			},
		};
	};
	const monaco = {
		languages: {
			registerCompletionItemProvider: (
				selector: Monaco.languages.LanguageSelector,
				provider: unknown
			) => register('completion', selector, provider),
			registerHoverProvider: (
				selector: Monaco.languages.LanguageSelector,
				provider: unknown
			) => register('hover', selector, provider),
			registerSignatureHelpProvider: (
				selector: Monaco.languages.LanguageSelector,
				provider: unknown
			) => register('signature', selector, provider),
			registerOnTypeFormattingEditProvider: (
				selector: Monaco.languages.LanguageSelector,
				provider: unknown
			) => register('onType', selector, provider),
		},
	} as unknown as typeof Monaco;
	const worker = new FormattingWorker(configuration.capability),
		controller = new AbortController();
	const statuses: string[] = [];
	return {
		model,
		worker,
		monaco,
		controller,
		registrations,
		statuses,
		options: {
			worker: worker as unknown as Worker,
			model,
			monaco,
			signal: controller.signal,
			phpVersion: '8.5' as const,
			onStatus: (status: string) => statuses.push(status),
		},
		provider: () =>
			registrations.find((r) => r.kind === 'onType' && !r.disposed)
				?.provider as
				| Monaco.languages.OnTypeFormattingEditProvider
				| undefined,
		change: (value = text + '// changed\n') => {
			text = value;
			version++;
			for (const listener of changes) listener();
		},
		close: () => {
			closed = true;
			for (const listener of closes) listener();
		},
		setLanguage: (value: string) => {
			language = value;
		},
		listenerCount: () => changes.size + closes.size,
	};
}

function cancellation() {
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
		},
	};
}

const position = { lineNumber: 4, column: 1 } as Monaco.Position;
const formatOptions = { tabSize: 4, insertSpaces: true };
const edits = [
	{
		range: {
			start: { line: 2, character: 0 },
			end: { line: 4, character: 0 },
		},
		newText:
			'/**\n * Greet a caller.\n * @param mixed $name\n * @return string\n */\n',
	},
	{
		range: {
			start: { line: 1, character: 3 },
			end: { line: 1, character: 5 },
		},
		newText: '猫',
	},
];

describe('public on-type formatting provider', () => {
	it.each([
		{ name: 'absent', capability: undefined, supported: false },
		{ name: 'null', capability: null, supported: false },
		{ name: 'false', capability: false, supported: false },
		{ name: 'malformed', capability: {}, supported: false },
		{
			name: 'other trigger',
			capability: { firstTriggerCharacter: ';' },
			supported: false,
		},
		{
			name: 'newline first',
			capability: { firstTriggerCharacter: '\n' },
			supported: true,
		},
		{
			name: 'newline additional',
			capability: {
				firstTriggerCharacter: ';',
				moreTriggerCharacter: ['\n', '}'],
			},
			supported: true,
		},
	])(
		'registers only advertised newline support: $name',
		async ({ capability, supported }) => {
			const sut = fixture({ capability });
			const client = await LspClient.connect(sut.options);
			const registered = sut.registrations.filter(
				(r) => r.kind === 'onType'
			);
			const got = registered.map((r) => ({
				selector: r.selector,
				triggers: (
					r.provider as Monaco.languages.OnTypeFormattingEditProvider
				).autoFormatTriggerCharacters,
			}));
			client.dispose();
			expect(got).toEqual(
				supported
					? [
							{
								selector: {
									language: 'php',
									scheme: 'inmemory',
									pattern: '/active.php',
								},
								triggers: ['\n'],
							},
						]
					: []
			);
		}
	);

	it('advertises static on-type support without claiming dynamic registration', async () => {
		const sut = fixture();
		const client = await LspClient.connect(sut.options);
		const got = sut.worker.sent[0];
		client.dispose();
		expect(got).toEqual({
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: {
				processId: null,
				rootUri: null,
				capabilities: {
					general: { positionEncodings: ['utf-16'] },
					textDocument: {
						completion: {
							completionItem: { snippetSupport: true },
						},
						hover: { contentFormat: ['markdown', 'plaintext'] },
						onTypeFormatting: { dynamicRegistration: false },
					},
				},
				initializationOptions: { phpVersion: '8.5' },
			},
		});
	});

	it.each([
		{ tabSize: 4, insertSpaces: true },
		{ tabSize: 2, insertSpaces: false },
	])(
		'sends latest didChange before exact UTF16 request with options $tabSize/$insertSpaces',
		async (options) => {
			const sut = fixture();
			const client = await LspClient.connect(sut.options);
			const source =
				'<?php\r\n/* 🐈 */\r\n/**\r\n\r\nfunction greet($name): string { return $name; }\r\n';
			sut.change(source);
			await sut
				.provider()!
				.provideOnTypeFormattingEdits(
					sut.model,
					position,
					'\n',
					options,
					cancellation().token
				);
			const got = sut.worker.sent.filter(
				(m) =>
					m.method === 'textDocument/didChange' ||
					m.method === 'textDocument/onTypeFormatting'
			);
			client.dispose();
			expect(got).toEqual([
				{
					jsonrpc: '2.0',
					method: 'textDocument/didChange',
					params: {
						textDocument: {
							uri: 'inmemory://model/active.php',
							version: 2,
						},
						contentChanges: [{ text: source }],
					},
				},
				{
					jsonrpc: '2.0',
					id: 2,
					method: 'textDocument/onTypeFormatting',
					params: {
						textDocument: { uri: 'inmemory://model/active.php' },
						position: { line: 3, character: 0 },
						ch: '\n',
						options,
					},
				},
			]);
		}
	);

	it('returns every TextEdit in order as plain UTF16 edits without changing the document', async () => {
		const sut = fixture();
		sut.worker.result = edits;
		const client = await LspClient.connect(sut.options);
		const before = sut.model.getValue();
		const got = await sut
			.provider()!
			.provideOnTypeFormattingEdits(
				sut.model,
				position,
				'\n',
				formatOptions,
				cancellation().token
			);
		client.dispose();
		expect({ edits: got, text: sut.model.getValue() }).toEqual({
			edits: [
				{
					range: {
						startLineNumber: 3,
						startColumn: 1,
						endLineNumber: 5,
						endColumn: 1,
					},
					text: '/**\n * Greet a caller.\n * @param mixed $name\n * @return string\n */\n',
				},
				{
					range: {
						startLineNumber: 2,
						startColumn: 4,
						endLineNumber: 2,
						endColumn: 6,
					},
					text: '猫',
				},
			],
			text: before,
		});
	});

	it.each(['empty', 'null', 'error'] as const)(
		'returns no edits for backend %s',
		async (kind) => {
			const sut = fixture();
			sut.worker.result = kind === 'null' ? null : [];
			if (kind === 'error')
				sut.worker.failure = {
					code: -32603,
					message: 'Formatting failed',
				};
			const client = await LspClient.connect(sut.options);
			const got = await sut
				.provider()!
				.provideOnTypeFormattingEdits(
					sut.model,
					position,
					'\n',
					formatOptions,
					cancellation().token
				);
			client.dispose();
			expect(got).toEqual([]);
		}
	);

	it.each([
		'foreign model',
		'same URI different model',
		'non-PHP',
		'closed',
		'cancelled',
		'wrong character',
	] as const)('does not request for %s', async (kind) => {
		const sut = fixture(),
			other = fixture(
				{ capability: undefined },
				kind === 'same URI different model'
					? '/active.php'
					: '/other.php'
			);
		const client = await LspClient.connect(sut.options),
			provider = sut.provider()!,
			token = cancellation();
		if (kind === 'non-PHP') sut.setLanguage('html');
		if (kind === 'closed') sut.close();
		if (kind === 'cancelled') token.cancel();
		const model =
			kind === 'foreign model' || kind === 'same URI different model'
				? other.model
				: sut.model;
		const got = await provider.provideOnTypeFormattingEdits(
			model,
			position,
			kind === 'wrong character' ? '}' : '\n',
			formatOptions,
			token.token
		);
		const requests = sut.worker.sent.filter(
			(m) => m.method === 'textDocument/onTypeFormatting'
		);
		client.dispose();
		expect({ edits: got, requests }).toEqual({ edits: [], requests: [] });
	});

	it.each([
		'edit',
		'close',
		'dispose',
		'abort',
		'workererror',
		'messageerror',
		'cancel',
	] as const)('drops pending edits after %s', async (kind) => {
		const sut = fixture();
		sut.worker.deferFormatting = true;
		const client = await LspClient.connect(sut.options),
			token = cancellation(),
			provider = sut.provider()!;
		const pending = provider.provideOnTypeFormattingEdits(
			sut.model,
			position,
			'\n',
			formatOptions,
			token.token
		);
		const request = sut.worker.sent.find(
			(m) => m.method === 'textDocument/onTypeFormatting'
		)!;
		const actions = {
			edit: () => sut.change(),
			close: () => sut.close(),
			dispose: () => client.dispose(),
			abort: () => sut.controller.abort(),
			workererror: () => sut.worker.dispatchEvent(new Event('error')),
			messageerror: () =>
				sut.worker.dispatchEvent(new Event('messageerror')),
			cancel: () => token.cancel(),
		};
		actions[kind]();
		sut.worker.reply({ jsonrpc: '2.0', id: request.id, result: edits });
		const got = await pending;
		client.dispose();
		expect(got).toEqual([]);
	});

	it('cleans registrations and model listeners on abort after connection', async () => {
		const sut = fixture();
		await LspClient.connect(sut.options);
		sut.controller.abort();
		const got = {
			active: sut.registrations.filter((r) => !r.disposed).length,
			modelListeners: sut.listenerCount(),
			terminated: sut.worker.terminated,
		};
		expect(got).toEqual({ active: 0, modelListeners: 0, terminated: true });
	});

	it('keeps two model registrations and requests separated by URI', async () => {
		const first = fixture(
				{ capability: { firstTriggerCharacter: '\n' } },
				'/first.php'
			),
			second = fixture(
				{ capability: { firstTriggerCharacter: '\n' } },
				'/second.php'
			);
		const a = await LspClient.connect(first.options),
			b = await LspClient.connect(second.options);
		await first
			.provider()!
			.provideOnTypeFormattingEdits(
				first.model,
				position,
				'\n',
				formatOptions,
				cancellation().token
			);
		await second
			.provider()!
			.provideOnTypeFormattingEdits(
				second.model,
				position,
				'\n',
				formatOptions,
				cancellation().token
			);
		const got = [first, second].map((s) => ({
			selector: s.registrations.find((r) => r.kind === 'onType')!
				.selector,
			params: s.worker.sent.find(
				(m) => m.method === 'textDocument/onTypeFormatting'
			)!.params,
		}));
		a.dispose();
		b.dispose();
		expect(got).toEqual([
			{
				selector: {
					language: 'php',
					scheme: 'inmemory',
					pattern: '/first.php',
				},
				params: {
					textDocument: { uri: 'inmemory://model/first.php' },
					position: { line: 3, character: 0 },
					ch: '\n',
					options: formatOptions,
				},
			},
			{
				selector: {
					language: 'php',
					scheme: 'inmemory',
					pattern: '/second.php',
				},
				params: {
					textDocument: { uri: 'inmemory://model/second.php' },
					position: { line: 3, character: 0 },
					ch: '\n',
					options: formatOptions,
				},
			},
		]);
	});

	it('disposes an on-type registration returned after synchronous abort', async () => {
		const sut = fixture();
		const register =
			sut.monaco.languages.registerOnTypeFormattingEditProvider;
		sut.monaco.languages.registerOnTypeFormattingEditProvider = (
			selector,
			provider
		) => {
			const disposable = register(selector, provider);
			sut.controller.abort();
			return disposable;
		};
		const got = LspClient.connect(sut.options);
		await expect(got).rejects.toThrow(
			new Error('LSP connection cancelled.')
		);
		expect({
			active: sut.registrations.filter((r) => !r.disposed).length,
			listeners: sut.listenerCount(),
			terminated: sut.worker.terminated,
			statuses: sut.statuses,
		}).toEqual({ active: 0, listeners: 0, terminated: true, statuses: [] });
	});

	it.each(['off', 'version'] as const)(
		'cannot apply a pending old-engine edit after %s',
		async (transition) => {
			const sut = fixture();
			sut.worker.deferFormatting = true;
			const client = await LspClient.connect(sut.options);
			const oldProvider = sut.provider()!;
			const pending = oldProvider.provideOnTypeFormattingEdits(
				sut.model,
				position,
				'\n',
				formatOptions,
				cancellation().token
			);
			const request = sut.worker.sent.find(
				(m) => m.method === 'textDocument/onTypeFormatting'
			)!;
			client.dispose();
			const next = fixture();
			const nextClient =
				transition === 'version'
					? await LspClient.connect({
							...next.options,
							model: sut.model,
							phpVersion: '8.0',
						})
					: undefined;
			sut.worker.reply({ jsonrpc: '2.0', id: request.id, result: edits });
			const result = await pending;
			const got = {
				edits: result,
				oldActive: sut.registrations.filter((r) => !r.disposed).length,
				oldTerminated: sut.worker.terminated,
				nextInitialize: next.worker.sent
					.filter((m) => m.method === 'initialize')
					.map(
						(m) =>
							(m.params as { initializationOptions: unknown })
								.initializationOptions
					),
			};
			nextClient?.dispose();
			expect(got).toEqual({
				edits: [],
				oldActive: 0,
				oldTerminated: true,
				nextInitialize:
					transition === 'version' ? [{ phpVersion: '8.0' }] : [],
			});
		}
	);
});
