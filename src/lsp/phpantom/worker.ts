/// <reference lib="webworker" />

import { ConsoleStdout, File, OpenFile, WASI } from '@bjorn3/browser_wasi_shim';
import { createWorkerMessageHandler } from './worker-message-handler';
import { loadPhpProfileDocuments } from './profile-loader.mjs';
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

const PHPANTOM_VERSION = '0.11.1';
const PHPANTOM_BUILD_ID = '49b9a75';
const WASM_SHA256 =
	'eab48a96e0d3add25e480e77799073577521a0971ceb1aa438bc6f64f590f0fa';
const WASM_URL = `/lsp/phpantom/phpantom_lsp.wasm?sha256=${WASM_SHA256}`;
let runtime: Promise<PhpantomExports> | undefined;
let queue = Promise.resolve();

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

const handleMessage = createWorkerMessageHandler({
	postMessage: (message) => self.postMessage(message),
	loadRuntime,
	send: sendToPhpantom,
	versions,
	buildId: PHPANTOM_BUILD_ID,
	loadProfile: (phpVersion, openDocument) =>
		loadPhpProfileDocuments({
			manifestUrl: '/lsp/phpantom/profiles/manifest.json',
			expectedManifestSha256: import.meta.env
				.VITE_PHPANTOM_PROFILE_MANIFEST_SHA256,
			phpVersion,
			baseUrl: self.location.href,
			fetchResource: fetch,
			openDocument,
			digest: async (bytes) => {
				const hash = await crypto.subtle.digest('SHA-256', bytes);
				return Array.from(new Uint8Array(hash), (byte) =>
					byte.toString(16).padStart(2, '0')
				).join('');
			},
		}),
});

self.addEventListener('message', (event: MessageEvent<unknown>) => {
	queue = queue.then(() => handleMessage(event.data));
});

export {};
