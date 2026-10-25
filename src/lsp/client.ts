import type * as Monaco from 'monaco-editor';

type RpcMessage = {
	jsonrpc: '2.0';
	id?: number;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
};

type RpcResult = Record<string, any>;
type ClientStatus = 'loading' | 'ready' | 'error';
type ClientOptions = {
	worker: Worker;
	model: Monaco.editor.ITextModel;
	monaco: typeof Monaco;
	phpVersion: string;
	onStatus: (status: ClientStatus, message?: string) => void;
};

const REQUEST_TIMEOUT_MS = 15_000;
const phpDocumentSelector = { language: 'php' };

function rpcError(message: RpcMessage): Error {
	return new Error(message.error?.message ?? 'LSP request failed.');
}

function lspRangeToMonaco(
	range: RpcResult,
	monaco: typeof Monaco
): Monaco.IRange {
	return {
		startLineNumber: range.start.line + 1,
		startColumn: range.start.character + 1,
		endLineNumber: range.end.line + 1,
		endColumn: range.end.character + 1,
	};
}

function completionKind(
	kind: number | undefined,
	monaco: typeof Monaco
): Monaco.languages.CompletionItemKind {
	const kinds = monaco.languages.CompletionItemKind;
	const map: Record<number, Monaco.languages.CompletionItemKind> = {
		1: kinds.Text,
		2: kinds.Method,
		3: kinds.Function,
		4: kinds.Constructor,
		5: kinds.Field,
		6: kinds.Variable,
		7: kinds.Class,
		8: kinds.Interface,
		9: kinds.Module,
		10: kinds.Property,
		11: kinds.Unit,
		12: kinds.Value,
		13: kinds.Enum,
		14: kinds.Keyword,
		15: kinds.Snippet,
		16: kinds.Color,
		17: kinds.File,
		18: kinds.Reference,
		19: kinds.Folder,
		20: kinds.EnumMember,
		21: kinds.Constant,
		22: kinds.Struct,
		23: kinds.Event,
		24: kinds.Operator,
		25: kinds.TypeParameter,
	};
	return map[kind ?? 1] ?? kinds.Text;
}

export class LspClient {
	private nextId = 1;
	private readonly pending = new Map<
		number,
		{ resolve: (value: RpcResult) => void; reject: (error: Error) => void }
	>();
	private readonly completionData = new WeakMap<
		Monaco.languages.CompletionItem,
		unknown
	>();
	private readonly disposables: Monaco.IDisposable[] = [];
	private readonly uri: string;
	private disposed = false;

	private constructor(private readonly options: ClientOptions) {
		this.uri = options.model.uri.toString();
		options.worker.addEventListener('message', this.handleMessage);
		options.worker.addEventListener('error', this.handleWorkerError);
		options.worker.addEventListener('messageerror', this.handleWorkerError);
	}

	static async connect(options: ClientOptions): Promise<LspClient> {
		const client = new LspClient(options);
		try {
			await client.request('initialize', {
				processId: null,
				rootUri: null,
				capabilities: {
					general: { positionEncodings: ['utf-16'] },
					textDocument: {
						completion: {
							completionItem: { snippetSupport: true },
						},
						hover: { contentFormat: ['markdown', 'plaintext'] },
					},
				},
				initializationOptions: { phpVersion: options.phpVersion },
			});
			client.notify('initialized', {});
			client.openDocument();
			client.registerProviders();
			options.onStatus('ready');
			return client;
		} catch (error) {
			client.dispose();
			throw error;
		}
	}

	private readonly handleMessage = (event: MessageEvent<RpcMessage>) => {
		const message = event.data;
		if (message.id === undefined) return;
		const pending = this.pending.get(message.id);
		if (!pending) return;
		this.pending.delete(message.id);
		if (message.error) pending.reject(rpcError(message));
		else pending.resolve((message.result ?? {}) as RpcResult);
	};

	private readonly handleWorkerError = (event: Event) => {
		const error = new Error(
			'PHPantom Worker failed. Reload the preview and try again.'
		);
		for (const pending of this.pending.values()) pending.reject(error);
		this.pending.clear();
		this.options.onStatus('error', error.message);
		if (event instanceof ErrorEvent) event.preventDefault();
	};

	private request(method: string, params: unknown): Promise<RpcResult> {
		if (this.disposed)
			return Promise.reject(new Error('LSP client disposed.'));
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const timer = window.setTimeout(() => {
				this.pending.delete(id);
				reject(
					new Error(`PHPantom timed out while handling ${method}.`)
				);
			}, REQUEST_TIMEOUT_MS);
			this.pending.set(id, {
				resolve: (value) => {
					window.clearTimeout(timer);
					resolve(value);
				},
				reject: (error) => {
					window.clearTimeout(timer);
					reject(error);
				},
			});
			this.options.worker.postMessage({
				jsonrpc: '2.0',
				id,
				method,
				params,
			});
		});
	}

	private notify(method: string, params: unknown): void {
		if (!this.disposed)
			this.options.worker.postMessage({ jsonrpc: '2.0', method, params });
	}

	private openDocument(): void {
		this.notify('textDocument/didOpen', {
			textDocument: {
				uri: this.uri,
				languageId: 'php',
				version: this.options.model.getVersionId(),
				text: this.options.model.getValue(),
			},
		});
		this.disposables.push(
			this.options.model.onDidChangeContent(() => {
				if (!this.disposed) {
					this.notify('textDocument/didChange', {
						textDocument: {
							uri: this.uri,
							version: this.options.model.getVersionId(),
						},
						contentChanges: [
							{ text: this.options.model.getValue() },
						],
					});
				}
			})
		);
	}

	private registerProviders(): void {
		const { monaco } = this.options;
		const currentPosition = (position: Monaco.Position) => ({
			line: position.lineNumber - 1,
			character: position.column - 1,
		});
		const isCurrentModel = (requestedModel: Monaco.editor.ITextModel) =>
			!this.disposed && requestedModel.uri.toString() === this.uri;

		this.disposables.push(
			monaco.languages.registerCompletionItemProvider(
				phpDocumentSelector,
				{
					triggerCharacters: ['$', '>', ':', '\\'],
					provideCompletionItems: async (
						requestedModel,
						position
					) => {
						if (!isCurrentModel(requestedModel))
							return { suggestions: [] };
						const version = requestedModel.getVersionId();
						try {
							const result = await this.request(
								'textDocument/completion',
								{
									textDocument: { uri: this.uri },
									position: currentPosition(position),
								}
							);
							if (
								!isCurrentModel(requestedModel) ||
								requestedModel.getVersionId() !== version
							)
								return { suggestions: [] };
							const list = Array.isArray(result)
								? { items: result }
								: result;
							const suggestions = (list.items ?? []).flatMap(
								(item: RpcResult) => {
									if (typeof item.label !== 'string')
										return [];
									const range =
										item.textEdit?.range ??
										item.textEdit?.replace ??
										item.textEdit?.insert;
									const insertText =
										item.textEdit?.newText ??
										item.insertText ??
										item.label;
									const word =
										requestedModel.getWordUntilPosition(
											position
										);
									const insertRange = range
										? lspRangeToMonaco(range, monaco)
										: {
												startLineNumber:
													position.lineNumber,
												startColumn: word.startColumn,
												endLineNumber:
													position.lineNumber,
												endColumn: word.endColumn,
											};
									const suggestion: Monaco.languages.CompletionItem =
										{
											label: item.label,
											kind: completionKind(
												item.kind,
												monaco
											),
											detail: item.detail,
											documentation:
												typeof item.documentation ===
												'string'
													? item.documentation
													: item.documentation?.value,
											filterText: item.filterText,
											sortText: item.sortText,
											insertText,
											insertTextRules:
												item.insertTextFormat === 2
													? monaco.languages
															.CompletionItemInsertTextRule
															.InsertAsSnippet
													: undefined,
											range: insertRange,
											command: item.command,
										};
									this.completionData.set(suggestion, item);
									return [suggestion];
								}
							);
							return {
								suggestions,
								incomplete: Boolean(list.isIncomplete),
							};
						} catch (error) {
							if (!this.disposed)
								this.options.onStatus(
									'error',
									(error as Error).message
								);
							return { suggestions: [] };
						}
					},
					resolveCompletionItem: async (item) => {
						const data = this.completionData.get(item);
						if (data === undefined) return item;
						try {
							const resolved = await this.request(
								'completionItem/resolve',
								data as RpcResult
							);
							item.detail = resolved.detail ?? item.detail;
							item.documentation =
								typeof resolved.documentation === 'string'
									? resolved.documentation
									: (resolved.documentation?.value ??
										item.documentation);
							return item;
						} catch {
							return item;
						}
					},
				}
			)
		);

		this.disposables.push(
			monaco.languages.registerHoverProvider(phpDocumentSelector, {
				provideHover: async (requestedModel, position) => {
					if (!isCurrentModel(requestedModel)) return null;
					const version = requestedModel.getVersionId();
					try {
						const result = await this.request(
							'textDocument/hover',
							{
								textDocument: { uri: this.uri },
								position: currentPosition(position),
							}
						);
						if (
							!result.contents ||
							!isCurrentModel(requestedModel) ||
							requestedModel.getVersionId() !== version
						)
							return null;
						const contents = Array.isArray(result.contents)
							? result.contents
							: [result.contents];
						return {
							contents: contents.map(
								(content: RpcResult | string) =>
									typeof content === 'string'
										? { value: content }
										: { value: content.value ?? '' }
							),
							range: result.range
								? lspRangeToMonaco(result.range, monaco)
								: undefined,
						};
					} catch {
						return null;
					}
				},
			})
		);

		this.disposables.push(
			monaco.languages.registerSignatureHelpProvider(
				phpDocumentSelector,
				{
					signatureHelpTriggerCharacters: ['(', ','],
					signatureHelpRetriggerCharacters: [','],
					provideSignatureHelp: async (requestedModel, position) => {
						if (!isCurrentModel(requestedModel)) return null;
						const version = requestedModel.getVersionId();
						try {
							const result = await this.request(
								'textDocument/signatureHelp',
								{
									textDocument: { uri: this.uri },
									position: currentPosition(position),
								}
							);
							if (
								!result.signatures ||
								!isCurrentModel(requestedModel) ||
								requestedModel.getVersionId() !== version
							)
								return null;
							return {
								value: {
									signatures: result.signatures.map(
										(signature: RpcResult) => ({
											label: signature.label,
											documentation:
												signature.documentation
													?.value ??
												signature.documentation,
											parameters:
												signature.parameters?.map(
													(parameter: RpcResult) => ({
														label: parameter.label,
														documentation:
															parameter
																.documentation
																?.value ??
															parameter.documentation,
													})
												),
										})
									),
									activeSignature:
										result.activeSignature ?? 0,
									activeParameter:
										result.activeParameter ?? 0,
								},
								dispose: () => undefined,
							};
						} catch {
							return null;
						}
					},
				}
			)
		);
	}

	dispose(): void {
		if (this.disposed) return;
		this.notify('textDocument/didClose', {
			textDocument: { uri: this.uri },
		});
		this.disposed = true;
		for (const disposable of this.disposables) disposable.dispose();
		this.options.worker.removeEventListener('message', this.handleMessage);
		this.options.worker.removeEventListener(
			'error',
			this.handleWorkerError
		);
		this.options.worker.removeEventListener(
			'messageerror',
			this.handleWorkerError
		);
		for (const pending of this.pending.values())
			pending.reject(new Error('LSP client disposed.'));
		this.pending.clear();
		this.options.worker.terminate();
	}
}
