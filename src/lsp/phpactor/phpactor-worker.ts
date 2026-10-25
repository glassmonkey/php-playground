import dispatchScript from './dispatch.php?raw';
import {
	startPHP,
	versions,
	type DataDependencyModule,
	type EmscriptenPHPModule,
	type PHP,
} from '../../php-wasm/php';
import * as phpLoader from '../../wasm-assets/php-8.5.js';
// @ts-ignore The generated Emscripten loader is intentionally kept beside its data asset, outside src/rootDir.
import * as phpactorDataLoader from '../../../assets/lsp/phpactor/phpactor-loader.js';

type JsonRpcId = string | number | null;
type JsonRpcMessage = {
	jsonrpc: '2.0';
	id?: JsonRpcId;
	method?: string;
	params?: unknown;
};
type JsonObject = Record<string, unknown>;
type TextDocumentItem = {
	uri: string;
	text: string;
	version: number;
};
type TextDocumentPositionParams = {
	textDocument: { uri: string };
	position: { line: number; character: number };
};
type OpenDocument = {
	text: string;
	version: number;
	path: string | null;
};

const scope = self as DedicatedWorkerGlobalScope;
const workspaceRoot = '/workspace';
const documents = new Map<string, OpenDocument>();
let php: PHP | undefined;
let phpVersion: string = '8.2';
let initialized = false;
let shutdown = false;
let messageQueue = Promise.resolve();

scope.addEventListener('message', (event: MessageEvent<JsonRpcMessage>) => {
	messageQueue = messageQueue
		.then(() => handleMessage(event.data))
		.catch((error: unknown) => {
			if (isRequest(event.data)) {
				sendError(event.data.id!, -32603, errorMessage(error));
			}
		});
});

async function handleMessage(message: JsonRpcMessage): Promise<void> {
	if (!isJsonRpcMessage(message)) {
		return;
	}
	if (!message.method) {
		if (isRequest(message)) {
			sendError(message.id!, -32600, 'Invalid Request');
		}
		return;
	}

	try {
		const result = await dispatch(message);
		if (isRequest(message)) {
			sendResult(message.id!, result);
		}
	} catch (error) {
		if (isRequest(message)) {
			sendError(
				message.id!,
				error instanceof MethodNotFound
					? -32601
					: error instanceof InvalidParams
						? -32602
						: -32603,
				errorMessage(error)
			);
		}
	}
}

async function dispatch(message: JsonRpcMessage): Promise<unknown> {
	const params = getParams(message.params);
	switch (message.method) {
		case 'initialize':
			if (initialized) {
				throw new Error('Phpactor worker is already initialized');
			}
			phpVersion = selectPhpVersion(
				getObject(params.initializationOptions)?.phpVersion
			);
			await startPhpactor();
			initialized = true;
			return {
				capabilities: {
					textDocumentSync: { openClose: true, change: 1 },
					completionProvider: {
						resolveProvider: false,
						triggerCharacters: ['$', '>', ':'],
					},
					signatureHelpProvider: { triggerCharacters: ['(', ','] },
					hoverProvider: true,
				},
				serverInfo: { name: 'phpactor-wasm', version: '2026.10.07.0' },
			};
		case 'initialized':
			return null;
		case 'shutdown':
			shutdown = true;
			return null;
		case 'exit':
			shutdown = true;
			scope.close();
			return null;
		case 'textDocument/didOpen':
			assertReady();
			openDocument(params.textDocument);
			return null;
		case 'textDocument/didChange':
			assertReady();
			changeDocument(params);
			return null;
		case 'textDocument/didClose':
			assertReady();
			closeDocument(getObject(params.textDocument)?.uri);
			return null;
		case 'textDocument/completion':
			return requestPhpactor('completion', params);
		case 'completionItem/resolve':
			// Items include documentation in the initial response, so resolve needs no second lookup.
			return params;
		case 'textDocument/signatureHelp':
			return requestPhpactor('signatureHelp', params);
		case 'textDocument/hover':
			return requestPhpactor('hover', params);
		default:
			if (isRequest(message)) {
				throw new MethodNotFound(message.method ?? '<missing>');
			}
			return null;
	}
}

async function startPhpactor(): Promise<void> {
	const wasmUrl = new URL(
		`/assets/${phpLoader.dependencyFilename ?? 'php-8.5.wasm'}`,
		scope.location.origin
	);
	const wasmResponse = await fetch(wasmUrl);
	if (!wasmResponse.ok) {
		throw new Error(`Could not load PHP 8.5 WASM (${wasmResponse.status})`);
	}
	const wasmBinary = await wasmResponse.arrayBuffer();
	let releaseRuntimeReady: () => void = () => undefined;
	let releasePhpactorReady: () => void = () => undefined;
	const runtimeReady = new Promise<void>((resolve) => {
		releaseRuntimeReady = resolve;
	});
	const phpactorReady = new Promise<void>((resolve) => {
		releasePhpactorReady = resolve;
	});
	const dataLoader = phpactorDataLoader as unknown as DataDependencyModule;
	const delayedDataModule = {
		dependenciesTotalSize: dataLoader.dependenciesTotalSize,
		dependencyFilename: dataLoader.dependencyFilename,
		default: async (module: EmscriptenPHPModule) => {
			await runtimeReady;
			await dataLoader.default(module);
			releasePhpactorReady();
		},
	};

	php = await startPHP(
		'8.5',
		phpLoader,
		'WORKER',
		{
			wasmBinary,
			ENV: { XDG_CACHE_HOME: '/cache' },
			locateFile: (filename: string) => {
				if (filename === 'phpactor.data') {
					return new URL(
						'/assets/lsp/phpactor/phpactor.data',
						scope.location.origin
					).href;
				}
				return filename;
			},
			onRuntimeInitialized: releaseRuntimeReady,
			printErr: (message: string) => console.error(message),
		},
		[delayedDataModule]
	);
	await phpactorReady;
	php.mkdirTree(workspaceRoot);
	php.writeFile('/phpactor-dispatch.php', dispatchScript);
}

function selectPhpVersion(value: unknown): string {
	if (
		typeof value === 'string' &&
		versions.includes(value as (typeof versions)[number])
	) {
		return value;
	}
	if (value === undefined) {
		return '8.2';
	}
	throw new Error(`Unsupported PHP analysis version: ${String(value)}`);
}

function openDocument(document: unknown): void {
	if (!validDocument(document)) {
		throw new InvalidParams('Invalid textDocument/didOpen params');
	}
	const path = workspacePath(document.uri);
	documents.set(document.uri, {
		text: document.text,
		version: document.version,
		path,
	});
	writeDocument(path, document.text);
}

function changeDocument(params: JsonObject): void {
	const textDocument = getObject(params.textDocument);
	const uri = textDocument?.uri;
	const changes = params.contentChanges;
	if (
		typeof uri !== 'string' ||
		typeof textDocument?.version !== 'number' ||
		!Array.isArray(changes)
	) {
		throw new InvalidParams('Invalid textDocument/didChange params');
	}
	const current = documents.get(uri);
	if (!current || !changes.length) {
		return;
	}
	const version = textDocument.version;
	if (typeof version === 'number' && version < current.version) {
		return;
	}
	const lastChange = getObject(changes[changes.length - 1]);
	if (typeof lastChange?.text !== 'string') {
		throw new InvalidParams('Invalid textDocument/didChange content');
	}
	const text = lastChange.text;
	const updated = {
		...current,
		text,
		version,
	};
	documents.set(uri, updated);
	writeDocument(updated.path, text);
}

function closeDocument(uri: unknown): void {
	if (typeof uri !== 'string') {
		return;
	}
	const document = documents.get(uri);
	documents.delete(uri);
	if (document?.path && php?.fileExists(document.path)) {
		php.unlink(document.path);
	}
}

async function requestPhpactor(
	operation: string,
	params: JsonObject
): Promise<unknown> {
	assertReady();
	if (!isTextDocumentPositionParams(params)) {
		throw new InvalidParams('Invalid text document position params');
	}
	const uri = params.textDocument.uri;
	const document = documents.get(uri);
	if (!document) {
		throw new Error('The requested PHP document is not open');
	}
	const text = document.text;
	const offset = byteOffsetAt(
		text,
		params.position.line,
		params.position.character
	);
	const request = {
		operation,
		phpVersion,
		workspaceRoot,
		textDocument: { text },
		offset,
	};
	php!.writeFile('/tmp/phpactor-request.json', JSON.stringify(request));
	const response = php!.run({ code: "include '/phpactor-dispatch.php';" });
	if (response.exitCode !== 0) {
		throw new Error(
			response.errors ||
				`Phpactor PHP request failed (${response.exitCode})`
		);
	}
	const result = JSON.parse(new TextDecoder().decode(response.body));
	if (result && typeof result === 'object' && 'error' in result) {
		throw new Error(String(result.error));
	}
	return result;
}

function writeDocument(path: string | null, text: string): void {
	if (!path || !php) {
		return;
	}
	php.mkdirTree(path.slice(0, path.lastIndexOf('/')) || workspaceRoot);
	php.writeFile(path, text);
}

function workspacePath(uri: string): string | null {
	let parsed: URL;
	try {
		parsed = new URL(uri);
	} catch {
		return null;
	}
	if (parsed.protocol !== 'file:') {
		return null;
	}
	const segments = decodeURIComponent(parsed.pathname)
		.split('/')
		.filter(Boolean);
	if (segments.some((segment) => segment === '.' || segment === '..')) {
		throw new Error(
			'Document URI must resolve inside the virtual workspace'
		);
	}
	return `${workspaceRoot}/${segments.join('/')}`;
}

function byteOffsetAt(text: string, line: number, character: number): number {
	if (line < 0 || character < 0) {
		throw new Error('LSP position cannot be negative');
	}
	let lineStart = 0;
	for (let currentLine = 0; currentLine < line; currentLine++) {
		const newline = text.indexOf('\n', lineStart);
		if (newline < 0) {
			return new TextEncoder().encode(text).length;
		}
		lineStart = newline + 1;
	}
	let lineEnd = text.indexOf('\n', lineStart);
	if (lineEnd < 0) {
		lineEnd = text.length;
	} else if (lineEnd > lineStart && text[lineEnd - 1] === '\r') {
		lineEnd--;
	}
	const utf16Offset = Math.min(lineStart + character, lineEnd);
	return new TextEncoder().encode(text.slice(0, utf16Offset)).length;
}

function assertReady(): PHP {
	if (!initialized || !php) {
		throw new Error('Phpactor worker has not been initialized');
	}
	if (shutdown) {
		throw new Error('Phpactor worker has shut down');
	}
	return php;
}

function validDocument(document: unknown): document is TextDocumentItem {
	const value = getObject(document);
	return (
		!!value &&
		typeof value.uri === 'string' &&
		typeof value.text === 'string' &&
		typeof value.version === 'number'
	);
}

function isJsonRpcMessage(value: unknown): value is JsonRpcMessage {
	const message = getObject(value);
	if (!message || message.jsonrpc !== '2.0') {
		return false;
	}
	if ('id' in message && !isJsonRpcId(message.id)) {
		return false;
	}
	return !('method' in message) || typeof message.method === 'string';
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
	return (
		value === null || typeof value === 'string' || typeof value === 'number'
	);
}

function getObject(value: unknown): JsonObject | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	return value as JsonObject;
}

function getParams(value: unknown): JsonObject {
	if (value === undefined) {
		return {};
	}
	const params = getObject(value);
	if (!params) {
		throw new InvalidParams('JSON-RPC params must be an object');
	}
	return params;
}

function isTextDocumentPositionParams(
	params: JsonObject
): params is JsonObject & TextDocumentPositionParams {
	const textDocument = getObject(params.textDocument);
	const position = getObject(params.position);
	return (
		typeof textDocument?.uri === 'string' &&
		typeof position?.line === 'number' &&
		typeof position.character === 'number'
	);
}

function isRequest(message: JsonRpcMessage): boolean {
	return Object.prototype.hasOwnProperty.call(message, 'id');
}

function sendResult(id: JsonRpcId, result: unknown): void {
	scope.postMessage({ jsonrpc: '2.0', id, result });
}

function sendError(id: JsonRpcId, code: number, message: string): void {
	scope.postMessage({ jsonrpc: '2.0', id, error: { code, message } });
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

class MethodNotFound extends Error {
	constructor(method: string) {
		super(`Method not found: ${method}`);
	}
}

class InvalidParams extends Error {
	constructor(message: string) {
		super(message);
	}
}
