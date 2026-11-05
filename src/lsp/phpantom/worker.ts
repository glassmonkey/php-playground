/// <reference lib="webworker" />

import { ConsoleStdout, File, OpenFile, WASI } from '@bjorn3/browser_wasi_shim';
import {
	isStaleDocumentVersion,
	phpVersionInitializationError,
} from './php-version.mjs';
import { versions } from '../../php-wasm/php';

type JsonRpcId = string | number | null;
type JsonRpcMessage = {
	jsonrpc: '2.0';
	id?: JsonRpcId;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
} & Record<string, unknown>;

type PhpantomExports = WebAssembly.Exports & {
	memory: WebAssembly.Memory;
	lsp_alloc(length: number): number;
	lsp_dealloc(pointer: number, length: number): void;
	lsp_handle(pointer: number, length: number): number;
	lsp_response_len(): number;
};

type OpenDocument = { version: number };

const PHPANTOM_VERSION = '0.11.1';
const PHPANTOM_VERSIONED_BUILD = '0.11.1+php-version-setting.3';
const WASM_SHA256 =
	'605854cd7d868c2432223c73d18002b2e39e86ea2c26e00655181a2345db6c4e';
const WASM_URL = `/lsp/phpantom/phpantom_lsp.wasm?sha256=${WASM_SHA256}`;
const documents = new Map<string, OpenDocument>();
let runtime: Promise<PhpantomExports> | undefined;
let queue = Promise.resolve();

function errorResponse(
	id: JsonRpcId,
	code: number,
	message: string
): JsonRpcMessage {
	return { jsonrpc: '2.0', id, error: { code, message } };
}

function loadRuntime(): Promise<PhpantomExports> {
	if (!runtime) runtime = instantiateRuntime();
	return runtime;
}

async function instantiateRuntime(): Promise<PhpantomExports> {
	const response = await fetch(WASM_URL);
	if (!response.ok) {
		throw new Error(
			`Could not load PHPantom ${PHPANTOM_VERSION} WASM (${response.status}).`
		);
	}

	const bytes = await response.arrayBuffer();
	const wasi = new WASI(
		[],
		[],
		[
			new OpenFile(new File([])),
			ConsoleStdout.lineBuffered((line) =>
				console.debug(`[PHPantom] ${line}`)
			),
			ConsoleStdout.lineBuffered((line) =>
				console.warn(`[PHPantom] ${line}`)
			),
		]
	);
	const module = await WebAssembly.compile(bytes);
	const instance = await WebAssembly.instantiate(module, {
		wasi_snapshot_preview1: wasi.wasiImport,
	});
	wasi.initialize(
		instance as WebAssembly.Instance & {
			exports: {
				memory: WebAssembly.Memory;
				_initialize?: () => unknown;
			};
		}
	);

	const exports = instance.exports as PhpantomExports;
	if (
		!(exports.memory instanceof WebAssembly.Memory) ||
		typeof exports.lsp_alloc !== 'function' ||
		typeof exports.lsp_dealloc !== 'function' ||
		typeof exports.lsp_handle !== 'function' ||
		typeof exports.lsp_response_len !== 'function'
	) {
		throw new Error(
			'PHPantom WASM is missing one or more required LSP exports.'
		);
	}
	return exports;
}

function sendToPhpantom(
	exports: PhpantomExports,
	message: JsonRpcMessage
): JsonRpcMessage | null {
	const payload = new TextEncoder().encode(JSON.stringify(message));
	const inputPointer = exports.lsp_alloc(payload.length);
	if (inputPointer === 0)
		throw new Error('PHPantom could not allocate the LSP request buffer.');

	let outputPointer = 0;
	let outputLength = 0;
	try {
		new Uint8Array(exports.memory.buffer, inputPointer, payload.length).set(
			payload
		);
		outputPointer = exports.lsp_handle(inputPointer, payload.length);
		if (outputPointer === 0) return null;

		outputLength = exports.lsp_response_len();
		const responseBytes = new Uint8Array(
			exports.memory.buffer,
			outputPointer,
			outputLength
		).slice();
		return JSON.parse(
			new TextDecoder().decode(responseBytes)
		) as JsonRpcMessage;
	} finally {
		exports.lsp_dealloc(inputPointer, payload.length);
		if (outputPointer !== 0)
			exports.lsp_dealloc(outputPointer, outputLength);
	}
}

function isMessage(value: unknown): value is JsonRpcMessage {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function initializeVersionError(message: JsonRpcMessage): string | undefined {
	if (message.method !== 'initialize' || !isMessage(message.params)) return;
	const options = message.params.initializationOptions;
	if (!isMessage(options)) return;
	return phpVersionInitializationError(options, versions);
}

function shouldIgnoreStaleChange(message: JsonRpcMessage): boolean {
	if (
		message.method !== 'textDocument/didChange' ||
		!isMessage(message.params)
	)
		return false;
	const document = message.params.textDocument;
	if (
		!isMessage(document) ||
		typeof document.uri !== 'string' ||
		typeof document.version !== 'number'
	) {
		return false;
	}
	const current = documents.get(document.uri);
	if (isStaleDocumentVersion(current?.version, document.version)) return true;
	documents.set(document.uri, { version: document.version });
	return false;
}

function updateDocumentState(message: JsonRpcMessage): void {
	if (
		message.method === 'textDocument/didOpen' &&
		isMessage(message.params)
	) {
		const document = message.params.textDocument;
		if (
			isMessage(document) &&
			typeof document.uri === 'string' &&
			typeof document.version === 'number'
		) {
			documents.set(document.uri, { version: document.version });
		}
	}
	if (
		message.method === 'textDocument/didClose' &&
		isMessage(message.params)
	) {
		const document = message.params.textDocument;
		if (isMessage(document) && typeof document.uri === 'string')
			documents.delete(document.uri);
	}
}

async function handleMessage(data: unknown): Promise<void> {
	if (
		!isMessage(data) ||
		data.jsonrpc !== '2.0' ||
		typeof data.method !== 'string'
	) {
		self.postMessage(
			errorResponse(null, -32600, 'Invalid JSON-RPC request.')
		);
		return;
	}
	const message = data;
	if (shouldIgnoreStaleChange(message)) return;
	const versionError = initializeVersionError(message);
	if (versionError) {
		if (message.id !== undefined)
			self.postMessage(errorResponse(message.id, -32602, versionError));
		return;
	}

	try {
		const response = sendToPhpantom(await loadRuntime(), message);
		if (message.method === 'initialize') {
			const result =
				response && isMessage(response.result)
					? response.result
					: undefined;
			const serverInfo =
				result && isMessage(result.serverInfo)
					? result.serverInfo
					: undefined;
			const initializationOptions = isMessage(message.params)
				? message.params.initializationOptions
				: undefined;
			const configuredPhpVersion =
				isMessage(initializationOptions) &&
				typeof initializationOptions.phpVersion === 'string'
					? initializationOptions.phpVersion
					: '8.5';
			if (
				serverInfo?.version !==
				`${PHPANTOM_VERSIONED_BUILD}:php${configuredPhpVersion}`
			) {
				throw new Error(
					`PHPantom WASM does not include PHP ${configuredPhpVersion} selection. Supported targets: ${versions.join(', ')}. Rebuild with make build-phpantom-runtime.`
				);
			}
		}
		updateDocumentState(message);
		if (response !== null) self.postMessage(response);
	} catch (error) {
		if (message.id !== undefined) {
			const reason =
				error instanceof Error ? error.message : String(error);
			self.postMessage(errorResponse(message.id, -32002, reason));
		}
	}
}

self.addEventListener('message', (event: MessageEvent<unknown>) => {
	queue = queue.then(() => handleMessage(event.data));
});

export {};
