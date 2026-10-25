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
	params?: any;
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
				error instanceof MethodNotFound ? -32601 : -32603,
				errorMessage(error)
			);
		}
	}
}

async function dispatch(message: JsonRpcMessage): Promise<unknown> {
	const params = message.params ?? {};
	switch (message.method) {
		case 'initialize':
			if (initialized) {
				throw new Error('Phpactor worker is already initialized');
			}
			phpVersion = selectPhpVersion(
				params.initializationOptions?.phpVersion
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
			closeDocument(params.textDocument?.uri);
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

function openDocument(document: any): void {
	if (!validDocument(document)) {
		throw new Error('Invalid textDocument/didOpen params');
	}
	const path = workspacePath(document.uri);
	documents.set(document.uri, {
		text: document.text,
		version: document.version,
		path,
	});
	writeDocument(path, document.text);
}

function changeDocument(params: any): void {
	const uri = params.textDocument?.uri;
	const current = documents.get(uri);
	const changes = params.contentChanges;
	if (!current || !Array.isArray(changes) || !changes.length) {
		return;
	}
	const version = params.textDocument.version;
	if (typeof version === 'number' && version < current.version) {
		return;
	}
	const text = changes[changes.length - 1].text;
	if (typeof text !== 'string') {
		return;
	}
	const updated = {
		...current,
		text,
		version: typeof version === 'number' ? version : current.version,
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
	params: any
): Promise<unknown> {
	assertReady();
	const uri = params.textDocument?.uri;
	const document = documents.get(uri);
	if (
		!document ||
		typeof params.position?.line !== 'number' ||
		typeof params.position?.character !== 'number'
	) {
		throw new Error(
			'The requested PHP document is not open or its position is invalid'
		);
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

function validDocument(document: any): boolean {
	return (
		document &&
		typeof document.uri === 'string' &&
		typeof document.text === 'string' &&
		typeof document.version === 'number'
	);
}

function isJsonRpcMessage(value: unknown): value is JsonRpcMessage {
	return (
		!!value &&
		typeof value === 'object' &&
		(value as JsonRpcMessage).jsonrpc === '2.0'
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
