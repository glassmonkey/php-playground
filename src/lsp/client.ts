import type * as Monaco from 'monaco-editor';

type RpcMessage = {
	jsonrpc: '2.0';
	id?: number;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
};

type LspPosition = { line: number; character: number };
type LspRange = { start: LspPosition; end: LspPosition };
type LspMarkupContent = { kind: 'markdown' | 'plaintext'; value: string };
type LspDocumentation = string | LspMarkupContent;
type LspTextEdit =
	| { range: LspRange; newText: string }
	| { insert: LspRange; replace: LspRange; newText: string };
type LspCommand = {
	command: string;
	title: string;
	arguments?: unknown[];
};
type LspCompletionItem = {
	[key: string]: unknown;
	label: string;
	kind?: number;
	detail?: string;
	documentation?: LspDocumentation;
	filterText?: string;
	sortText?: string;
	insertText?: string;
	insertTextFormat?: number;
	textEdit?: LspTextEdit;
	command?: LspCommand;
};
type LspCompletionList = {
	items: LspCompletionItem[];
	isIncomplete?: boolean;
};
type LspHoverContent =
	| string
	| LspMarkupContent
	| { language: string; value: string };
type LspHover = {
	contents?: LspHoverContent | LspHoverContent[];
	range?: LspRange;
};
type LspParameterInformation = {
	label: string | [number, number];
	documentation?: LspDocumentation;
};
type LspSignatureInformation = {
	label: string;
	documentation?: LspDocumentation;
	parameters?: LspParameterInformation[];
};
type LspSignatureHelp = {
	signatures: LspSignatureInformation[];
	activeSignature?: number;
	activeParameter?: number;
};
type ClientStatus = 'loading' | 'ready' | 'error';
type ClientOptions = {
	worker: Worker;
	model: Monaco.editor.ITextModel;
	monaco: typeof Monaco;
	phpVersion: string;
	getPosition?: () => Monaco.Position | null;
	consumeManualCompletionShortcut?: () => boolean;
	triggerCompletion?: () => void;
	onStatus: (status: ClientStatus, message?: string) => void;
};

const REQUEST_TIMEOUT_MS = 15_000;
const AUTO_TRIGGER_SETTLE_MS = 100;
const phpDocumentSelector = { language: 'php' };

function traceCompletion(event: string, fields: Record<string, unknown>) {
	if (!import.meta.env.DEV) return;
	try {
		if (window.localStorage.getItem('phpactorLspTrace') !== '1') return;
		console.info('[phpactor-lsp]', {
			at_ms: Math.round(performance.now()),
			event,
			...fields,
		});
	} catch {
		// Diagnostics are optional and must not affect completion.
	}
}

function settleAutomaticTrigger(
	model: Monaco.editor.ITextModel,
	token: Monaco.CancellationToken
): Promise<boolean> {
	return new Promise((resolve) => {
		let timer: number | undefined;
		let settled = false;
		const subscriptions: Monaco.IDisposable[] = [];
		const finish = (ready: boolean) => {
			if (settled) return;
			settled = true;
			if (timer !== undefined) window.clearTimeout(timer);
			for (const subscription of subscriptions) subscription.dispose();
			resolve(ready);
		};
		const schedule = () => {
			if (timer !== undefined) window.clearTimeout(timer);
			timer = window.setTimeout(
				() => finish(!token.isCancellationRequested),
				AUTO_TRIGGER_SETTLE_MS
			);
		};

		const modelChange = model.onDidChangeContent(schedule);
		subscriptions.push(modelChange);
		const cancellation = token.onCancellationRequested(() => finish(false));
		subscriptions.push(cancellation);
		if (settled) cancellation.dispose();
		if (token.isCancellationRequested) finish(false);
		else schedule();
	});
}

function raceCompletionCancellation<T>(
	request: Promise<T>,
	token: Monaco.CancellationToken
): Promise<{ kind: 'response'; value: T } | { kind: 'cancelled' }> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const subscriptions: Monaco.IDisposable[] = [];
		const finish = (
			result: { kind: 'response'; value: T } | { kind: 'cancelled' }
		) => {
			if (settled) return;
			settled = true;
			for (const subscription of subscriptions) subscription.dispose();
			resolve(result);
		};

		const cancellation = token.onCancellationRequested(() =>
			finish({ kind: 'cancelled' })
		);
		subscriptions.push(cancellation);
		if (settled) {
			cancellation.dispose();
			return;
		}
		if (token.isCancellationRequested) {
			finish({ kind: 'cancelled' });
			return;
		}
		request.then(
			(value) => finish({ kind: 'response', value }),
			(error: unknown) => {
				if (settled) return;
				settled = true;
				for (const subscription of subscriptions)
					subscription.dispose();
				reject(error);
			}
		);
	});
}

function rpcError(): Error {
	return new Error('Phpactor request failed.');
}

function lspRangeToMonaco(range: LspRange): Monaco.IRange {
	return {
		startLineNumber: range.start.line + 1,
		startColumn: range.start.character + 1,
		endLineNumber: range.end.line + 1,
		endColumn: range.end.character + 1,
	};
}

function documentationText(documentation: LspDocumentation | undefined) {
	return typeof documentation === 'string'
		? documentation
		: documentation?.value;
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
	private nextCompletionId = 1;
	private latestCompletionId = 0;
	private completionBarrier: Promise<void> | undefined;
	private completionRetryTimer: number | undefined;
	private completionRetrySubscription: Monaco.IDisposable | undefined;
	private automaticRetryVersion: number | undefined;
	private readonly pendingAutomaticCompletionVersions = new Map<
		number,
		number
	>();
	private readonly pending = new Map<
		number,
		{ resolve: (value: unknown) => void; reject: (error: Error) => void }
	>();
	private readonly completionData = new WeakMap<
		Monaco.languages.CompletionItem,
		LspCompletionItem
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
		if (message.error) pending.reject(rpcError());
		else pending.resolve(message.result ?? {});
	};

	private readonly handleWorkerError = (event: Event) => {
		const error = new Error(
			'Phpactor Worker failed. Reload the preview and try again.'
		);
		for (const pending of this.pending.values()) pending.reject(error);
		this.pending.clear();
		this.options.onStatus('error', error.message);
		if (event instanceof ErrorEvent) event.preventDefault();
	};

	private request<T>(method: string, params: unknown): Promise<T> {
		if (this.disposed)
			return Promise.reject(new Error('LSP client disposed.'));
		const id = this.nextId++;
		return new Promise<T>((resolve, reject) => {
			const timer = window.setTimeout(() => {
				this.pending.delete(id);
				reject(
					new Error(`Phpactor timed out while handling ${method}.`)
				);
			}, REQUEST_TIMEOUT_MS);
			this.pending.set(id, {
				resolve: (value) => {
					window.clearTimeout(timer);
					resolve(value as T);
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

	private trackCompletionRequest(
		request: Promise<unknown>,
		completionId: number,
		version: number,
		automatic: boolean
	): void {
		if (automatic)
			this.pendingAutomaticCompletionVersions.set(completionId, version);
		const observed = request.then(
			() => {
				this.pendingAutomaticCompletionVersions.delete(completionId);
			},
			() => {
				this.pendingAutomaticCompletionVersions.delete(completionId);
			}
		);
		const previous = this.completionBarrier;
		const barrier = previous
			? Promise.all([previous, observed]).then(() => undefined)
			: observed;
		this.completionBarrier = barrier;
		void barrier.then(() => {
			if (this.completionBarrier === barrier)
				this.completionBarrier = undefined;
		});
	}

	private cancelAutomaticCompletionRetry(): void {
		if (this.completionRetryTimer !== undefined) {
			window.clearTimeout(this.completionRetryTimer);
			this.completionRetryTimer = undefined;
		}
		this.completionRetrySubscription?.dispose();
		this.completionRetrySubscription = undefined;
	}

	private scheduleAutomaticCompletionRetry(
		model: Monaco.editor.ITextModel,
		completionId: number
	): void {
		if (this.disposed || completionId !== this.latestCompletionId) return;
		this.cancelAutomaticCompletionRetry();
		const schedule = () => {
			if (this.completionRetryTimer !== undefined)
				window.clearTimeout(this.completionRetryTimer);
			this.completionRetryTimer = window.setTimeout(() => {
				this.completionRetryTimer = undefined;
				this.completionRetrySubscription?.dispose();
				this.completionRetrySubscription = undefined;
				if (
					this.disposed ||
					completionId !== this.latestCompletionId ||
					model.uri.toString() !== this.uri
				)
					return;
				traceCompletion('automatic-retry-triggered', {
					completion_id: completionId,
					model_version: model.getVersionId(),
				});
				this.automaticRetryVersion = model.getVersionId();
				this.options.triggerCompletion?.();
			}, AUTO_TRIGGER_SETTLE_MS);
		};
		this.completionRetrySubscription = model.onDidChangeContent(schedule);
		schedule();
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
					this.automaticRetryVersion = undefined;
					this.notify('textDocument/didChange', {
						textDocument: {
							uri: this.uri,
							version: this.options.model.getVersionId(),
						},
						contentChanges: [
							{ text: this.options.model.getValue() },
						],
					});
					if (
						[
							...this.pendingAutomaticCompletionVersions.values(),
						].some(
							(requestVersion) =>
								requestVersion !==
								this.options.model.getVersionId()
						)
					)
						this.scheduleAutomaticCompletionRetry(
							this.options.model,
							this.latestCompletionId
						);
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
						position,
						context,
						token
					) => {
						this.cancelAutomaticCompletionRetry();
						const completionId = this.nextCompletionId++;
						this.latestCompletionId = completionId;
						const recoveryRetry =
							this.automaticRetryVersion ===
							requestedModel.getVersionId();
						this.automaticRetryVersion = undefined;
						const triggerKind = context.triggerKind;
						const manualShortcut =
							triggerKind === 0 &&
							(this.options.consumeManualCompletionShortcut?.() ??
								false);
						const automatic = !manualShortcut;
						const invocationVersion = requestedModel.getVersionId();
						const startedAt = performance.now();
						traceCompletion('provider-invoked', {
							completion_id: completionId,
							trigger_kind: triggerKind,
							trigger_character: context.triggerCharacter,
							model_version: requestedModel.getVersionId(),
						});
						if (
							token.isCancellationRequested ||
							!isCurrentModel(requestedModel)
						) {
							traceCompletion('provider-discarded', {
								completion_id: completionId,
								reason: token.isCancellationRequested
									? 'cancelled-before-dispatch'
									: 'model-not-current',
							});
							return { suggestions: [] };
						}
						if (automatic) {
							traceCompletion(
								'automatic-trigger-settle-started',
								{
									completion_id: completionId,
									delay_ms: AUTO_TRIGGER_SETTLE_MS,
								}
							);
							const ready = await settleAutomaticTrigger(
								requestedModel,
								token
							);
							if (!ready || !isCurrentModel(requestedModel)) {
								traceCompletion('provider-discarded', {
									completion_id: completionId,
									reason: token.isCancellationRequested
										? 'cancelled-before-dispatch'
										: 'model-not-current-before-dispatch',
									settle_ms: Math.round(
										performance.now() - startedAt
									),
								});
								if (
									automatic &&
									requestedModel.getVersionId() !==
										invocationVersion
								)
									this.scheduleAutomaticCompletionRetry(
										requestedModel,
										completionId
									);
								return { suggestions: [] };
							}
						}
						if (
							automatic &&
							!recoveryRetry &&
							this.completionBarrier
						) {
							traceCompletion(
								'automatic-trigger-waiting-for-inflight',
								{
									completion_id: completionId,
								}
							);
							const waiting = await raceCompletionCancellation(
								this.completionBarrier,
								token
							);
							if (
								waiting.kind === 'cancelled' ||
								completionId !== this.latestCompletionId
							) {
								traceCompletion('provider-discarded', {
									completion_id: completionId,
									reason:
										waiting.kind === 'cancelled'
											? 'cancelled-before-dispatch'
											: 'superseded-before-dispatch',
								});
								if (
									automatic &&
									requestedModel.getVersionId() !==
										invocationVersion
								)
									this.scheduleAutomaticCompletionRetry(
										requestedModel,
										completionId
									);
								return { suggestions: [] };
							}
						}
						if (
							completionId !== this.latestCompletionId ||
							token.isCancellationRequested
						) {
							traceCompletion('provider-discarded', {
								completion_id: completionId,
								reason: token.isCancellationRequested
									? 'cancelled-before-dispatch'
									: 'superseded-before-dispatch',
							});
							if (
								automatic &&
								requestedModel.getVersionId() !==
									invocationVersion
							)
								this.scheduleAutomaticCompletionRetry(
									requestedModel,
									completionId
								);
							return { suggestions: [] };
						}
						const version = requestedModel.getVersionId();
						const requestPosition =
							this.options.getPosition?.() ?? position;
						const requestStartedAt = performance.now();
						traceCompletion('rpc-sent', {
							completion_id: completionId,
							trigger_kind: triggerKind,
							model_version: version,
							position: {
								line: requestPosition.lineNumber,
								column: requestPosition.column,
							},
							wait_before_send_ms: Math.round(
								requestStartedAt - startedAt
							),
						});
						try {
							const request = this.request<
								LspCompletionList | LspCompletionItem[]
							>('textDocument/completion', {
								textDocument: { uri: this.uri },
								position: currentPosition(requestPosition),
							}).then(
								(result) => {
									traceCompletion('rpc-response', {
										completion_id: completionId,
										elapsed_ms: Math.round(
											performance.now() - requestStartedAt
										),
										cancelled:
											token.isCancellationRequested,
									});
									return result;
								},
								(error: unknown) => {
									traceCompletion('rpc-error', {
										completion_id: completionId,
										elapsed_ms: Math.round(
											performance.now() - requestStartedAt
										),
										cancelled:
											token.isCancellationRequested,
									});
									throw error;
								}
							);
							this.trackCompletionRequest(
								request,
								completionId,
								version,
								automatic
							);
							const completion = await raceCompletionCancellation(
								request,
								token
							);
							if (completion.kind === 'cancelled') {
								traceCompletion('provider-discarded', {
									completion_id: completionId,
									reason: 'cancelled-in-flight; worker-request-continues',
								});
								if (
									automatic &&
									requestedModel.getVersionId() !== version
								)
									this.scheduleAutomaticCompletionRetry(
										requestedModel,
										completionId
									);
								return { suggestions: [] };
							}
							const result = completion.value;
							if (
								!isCurrentModel(requestedModel) ||
								requestedModel.getVersionId() !== version
							) {
								traceCompletion('provider-discarded', {
									completion_id: completionId,
									reason: !isCurrentModel(requestedModel)
										? 'model-not-current-at-response'
										: 'document-version-changed-at-response',
									request_version: version,
									current_version:
										requestedModel.getVersionId(),
								});
								if (
									automatic &&
									requestedModel.getVersionId() !== version
								)
									this.scheduleAutomaticCompletionRetry(
										requestedModel,
										completionId
									);
								return { suggestions: [] };
							}
							const list = Array.isArray(result)
								? { items: result }
								: result;
							const suggestions = (list.items ?? []).flatMap(
								(item) => {
									if (typeof item.label !== 'string')
										return [];
									const range = item.textEdit
										? 'range' in item.textEdit
											? item.textEdit.range
											: item.textEdit.replace
										: undefined;
									const insertText =
										item.textEdit?.newText ??
										item.insertText ??
										item.label;
									const word =
										requestedModel.getWordUntilPosition(
											position
										);
									const line = requestedModel.getLineContent(
										position.lineNumber
									);
									const startsWithDollar =
										insertText.startsWith('$') &&
										line[word.startColumn - 2] === '$';
									const insertRange = range
										? lspRangeToMonaco(range)
										: {
												startLineNumber:
													position.lineNumber,
												startColumn:
													word.startColumn -
													(startsWithDollar ? 1 : 0),
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
											documentation: documentationText(
												item.documentation
											),
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
											command: item.command as
												| Monaco.languages.Command
												| undefined,
										};
									this.completionData.set(suggestion, item);
									return [suggestion];
								}
							);
							traceCompletion('provider-adopted', {
								completion_id: completionId,
								candidate_count: suggestions.length,
								model_version: version,
								total_ms: Math.round(
									performance.now() - startedAt
								),
							});
							return {
								suggestions,
								incomplete: Boolean(list.isIncomplete),
							};
						} catch (error) {
							if (
								!token.isCancellationRequested &&
								!this.disposed
							) {
								this.options.onStatus(
									'error',
									(error as Error).message
								);
							}
							traceCompletion('provider-error', {
								completion_id: completionId,
								cancelled: token.isCancellationRequested,
								error_type:
									error instanceof Error
										? error.name
										: 'unknown',
							});
							return { suggestions: [] };
						}
					},
					resolveCompletionItem: async (item) => {
						const data = this.completionData.get(item);
						if (data === undefined) return item;
						try {
							const resolved =
								await this.request<LspCompletionItem>(
									'completionItem/resolve',
									data
								);
							item.detail = resolved.detail ?? item.detail;
							item.documentation =
								documentationText(resolved.documentation) ??
								item.documentation;
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
						const result = await this.request<LspHover>(
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
							contents: contents.map((content) =>
								typeof content === 'string'
									? { value: content }
									: { value: content.value }
							),
							range: result.range
								? lspRangeToMonaco(result.range)
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
							const result = await this.request<LspSignatureHelp>(
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
										(signature) => ({
											label: signature.label,
											documentation: documentationText(
												signature.documentation
											),
											parameters:
												signature.parameters?.map(
													(parameter) => ({
														label: parameter.label,
														documentation:
															documentationText(
																parameter.documentation
															),
													})
												) as Monaco.languages.SignatureInformation['parameters'],
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
		this.cancelAutomaticCompletionRetry();
		this.pendingAutomaticCompletionVersions.clear();
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
