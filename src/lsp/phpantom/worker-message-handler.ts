import {
	applyPhpVersionCompletionFeatures,
	isStaleDocumentVersion,
	phpVersionInitializationError,
} from './php-version.mjs';
import { isReservedPhpantomProfileUri } from './profile-loader.mjs';

type JsonRpcId = string | number | null;
type JsonRpcMessage = {
	jsonrpc: '2.0';
	id?: JsonRpcId;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
} & Record<string, unknown>;

type PhpProfileDocument = { uri: string; text: string };

type Dependencies<Runtime> = {
	postMessage: (message: JsonRpcMessage) => void;
	loadRuntime: () => Promise<Runtime>;
	send: (runtime: Runtime, message: JsonRpcMessage) => JsonRpcMessage | null;
	loadProfile: (
		phpVersion: string,
		openDocument: (document: PhpProfileDocument) => Promise<void>
	) => Promise<void>;
	versions: readonly string[];
	buildId: string;
};

function isMessage(value: unknown): value is JsonRpcMessage {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorResponse(
	id: JsonRpcId,
	code: number,
	message: string
): JsonRpcMessage {
	return { jsonrpc: '2.0', id, error: { code, message } };
}

function selectedVersion(message: JsonRpcMessage, versions: readonly string[]) {
	if (message.method !== 'initialize') return;
	if (
		!isMessage(message.params) ||
		!isMessage(message.params.initializationOptions)
	) {
		return {
			error: 'initialize.params.initializationOptions.phpVersion is required.',
		};
	}
	const options = message.params.initializationOptions;
	const error = phpVersionInitializationError(options, versions);
	return error ? { error } : { version: options.phpVersion as string };
}

function messageDocumentUri(message: JsonRpcMessage) {
	if (!message.method?.startsWith('textDocument/')) return;
	if (!isMessage(message.params) || !isMessage(message.params.textDocument))
		return;
	const uri = message.params.textDocument.uri;
	return typeof uri === 'string' ? uri : undefined;
}

function reservedProfileUri(message: JsonRpcMessage) {
	const documentUri = messageDocumentUri(message);
	if (isReservedPhpantomProfileUri(documentUri)) return documentUri;
	if (!isMessage(message.params)) return;
	const fileEntries = Array.isArray(message.params.changes)
		? message.params.changes
		: Array.isArray(message.params.files)
			? message.params.files
			: [];
	for (const entry of fileEntries) {
		if (!isMessage(entry)) continue;
		for (const uri of [entry.uri, entry.oldUri, entry.newUri]) {
			if (isReservedPhpantomProfileUri(uri)) return uri;
		}
	}
	return undefined;
}

export function createWorkerMessageHandler<Runtime>(
	dependencies: Dependencies<Runtime>
) {
	const documents = new Map<string, number>();
	let runtime: Runtime | undefined;
	let selectedPhpVersion: string | undefined;
	let initializationInProgress = false;
	let upstreamInitialized = false;
	let failed: string | undefined;

	function send(message: JsonRpcMessage) {
		if (!runtime) throw new Error('PHPantom runtime is not initialized.');
		return dependencies.send(runtime, message);
	}

	function failWorker(message: string) {
		failed = message;
		selectedPhpVersion = undefined;
		documents.clear();
	}

	return async function handleWorkerMessage(data: unknown): Promise<void> {
		if (
			!isMessage(data) ||
			data.jsonrpc !== '2.0' ||
			typeof data.method !== 'string'
		) {
			dependencies.postMessage(
				errorResponse(null, -32600, 'Invalid JSON-RPC request.')
			);
			return;
		}
		const message = data;
		if (failed) {
			if (message.id !== undefined) {
				dependencies.postMessage(
					errorResponse(message.id, -32002, failed)
				);
			}
			return;
		}
		if (
			message.method !== 'initialize' &&
			message.method !== 'exit' &&
			selectedPhpVersion === undefined
		) {
			if (message.id !== undefined) {
				dependencies.postMessage(
					errorResponse(
						message.id,
						-32002,
						'PHPantom initialization and profile loading must complete first.'
					)
				);
			}
			return;
		}

		const nextVersion = selectedVersion(message, dependencies.versions);
		if (nextVersion && 'error' in nextVersion && nextVersion.error) {
			if (message.id !== undefined) {
				dependencies.postMessage(
					errorResponse(message.id, -32602, nextVersion.error)
				);
			}
			return;
		}
		if (
			message.method === 'initialize' &&
			selectedPhpVersion !== undefined
		) {
			dependencies.postMessage(
				errorResponse(
					message.id ?? null,
					-32002,
					nextVersion?.version === selectedPhpVersion
						? 'PHPantom Worker is already initialized.'
						: 'PHP version changes require a fresh Worker context.'
				)
			);
			return;
		}

		const uri = messageDocumentUri(message);
		const reservedUri = reservedProfileUri(message);
		if (reservedUri) {
			if (message.id !== undefined) {
				dependencies.postMessage(
					errorResponse(
						message.id,
						-32600,
						'PHP profile document URIs are reserved.'
					)
				);
			}
			return;
		}
		if (
			message.method === 'textDocument/didChange' &&
			isMessage(message.params) &&
			isMessage(message.params.textDocument) &&
			typeof message.params.textDocument.version === 'number' &&
			uri
		) {
			const incomingVersion = message.params.textDocument.version;
			if (isStaleDocumentVersion(documents.get(uri), incomingVersion))
				return;
			documents.set(uri, incomingVersion);
		}

		if (message.method === 'initialized' && upstreamInitialized) return;
		const openedProfileUris: string[] = [];
		if (message.method === 'initialize') {
			if (initializationInProgress) {
				dependencies.postMessage(
					errorResponse(
						message.id ?? null,
						-32002,
						'PHPantom initialization is already in progress.'
					)
				);
				return;
			}
			initializationInProgress = true;
		}

		try {
			runtime ??= await dependencies.loadRuntime();
			const response = send(message);
			if (message.method === 'initialize') {
				const serverInfo =
					isMessage(response?.result) &&
					isMessage(response.result.serverInfo)
						? response.result.serverInfo
						: undefined;
				if (serverInfo?.version !== dependencies.buildId) {
					throw new Error(
						`PHPantom WASM build identity ${serverInfo?.version ?? 'unknown'} does not match pinned upstream build ${dependencies.buildId}.`
					);
				}
				const version =
					nextVersion && 'version' in nextVersion
						? nextVersion.version
						: undefined;
				if (!version)
					throw new Error(
						'PHP version selection was lost during initialization.'
					);
				const initializedMessage = {
					jsonrpc: '2.0',
					method: 'initialized',
					params: {},
				} as const;
				send(initializedMessage);
				upstreamInitialized = true;
				await dependencies.loadProfile(
					version,
					async (profileDocument) => {
						if (
							!isReservedPhpantomProfileUri(profileDocument.uri)
						) {
							throw new Error(
								`Profile loader returned a non-reserved URI: ${profileDocument.uri}.`
							);
						}
						send({
							jsonrpc: '2.0',
							method: 'textDocument/didOpen',
							params: {
								textDocument: {
									uri: profileDocument.uri,
									languageId: 'php',
									version: 1,
									text: profileDocument.text,
								},
							},
						});
						openedProfileUris.push(profileDocument.uri);
						documents.set(profileDocument.uri, 1);
					}
				);
				selectedPhpVersion = version;
				initializationInProgress = false;
			}
			let outgoing = response;
			if (outgoing && message.method === 'textDocument/completion') {
				if (!selectedPhpVersion)
					throw new Error(
						'PHP version must be selected before completion.'
					);
				outgoing = {
					...outgoing,
					result: applyPhpVersionCompletionFeatures(
						message.method,
						outgoing.result,
						selectedPhpVersion
					),
				};
			}
			if (
				message.method === 'textDocument/didOpen' &&
				uri &&
				isMessage(message.params) &&
				isMessage(message.params.textDocument) &&
				typeof message.params.textDocument.version === 'number'
			) {
				documents.set(uri, message.params.textDocument.version);
			}
			if (message.method === 'textDocument/didClose' && uri)
				documents.delete(uri);
			if (outgoing !== null && outgoing !== undefined)
				dependencies.postMessage(outgoing);
		} catch (error) {
			const reason =
				error instanceof Error ? error.message : String(error);
			if (message.method === 'initialize') {
				initializationInProgress = false;
				for (const uri of openedProfileUris) {
					try {
						send({
							jsonrpc: '2.0',
							method: 'textDocument/didClose',
							params: { textDocument: { uri } },
						});
					} catch {
						break;
					}
				}
				try {
					send({
						jsonrpc: '2.0',
						id: -1,
						method: 'shutdown',
						params: null,
					});
					send({ jsonrpc: '2.0', method: 'exit' });
				} catch {
					// The failed runtime is discarded by the owning Worker.
				}
			}
			failWorker(reason);
			if (message.id !== undefined)
				dependencies.postMessage(
					errorResponse(message.id, -32002, reason)
				);
		}
	};
}
