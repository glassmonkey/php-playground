import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { ConsoleStdout, File, OpenFile, WASI } from '@bjorn3/browser_wasi_shim';
import {
	isStaleDocumentVersion,
	phpVersionInitializationError,
} from '../../../src/lsp/phpantom/php-version.mjs';

const wasmPath = new URL(
	'../../../assets/lsp/phpantom/phpantom_lsp.wasm',
	import.meta.url
);
const moduleStarted = performance.now();
const wasmBytes = await readFile(wasmPath);
const wasi = new WASI(
	[],
	[],
	[
		new OpenFile(new File([])),
		ConsoleStdout.lineBuffered(() => {}),
		ConsoleStdout.lineBuffered(() => {}),
	]
);
const module = await WebAssembly.compile(wasmBytes);
const instance = await WebAssembly.instantiate(module, {
	wasi_snapshot_preview1: wasi.wasiImport,
});
wasi.initialize(instance);
const moduleStartupMs = performance.now() - moduleStarted;

const wasm = instance.exports;
for (const name of [
	'memory',
	'lsp_alloc',
	'lsp_dealloc',
	'lsp_handle',
	'lsp_response_len',
]) {
	assert.ok(name in wasm, `official reactor exports ${name}`);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
function sendTo(wasmInstance, message) {
	const request = encoder.encode(JSON.stringify(message));
	const input = wasmInstance.lsp_alloc(request.length);
	assert.notEqual(
		input,
		0,
		'request buffer is allocated by the actual WASM module'
	);
	new Uint8Array(wasmInstance.memory.buffer, input, request.length).set(request);
	let output = 0;
	let outputLength = 0;
	try {
		output = wasmInstance.lsp_handle(input, request.length);
		if (output === 0) return null;
		outputLength = wasmInstance.lsp_response_len();
		const bytes = new Uint8Array(
			wasmInstance.memory.buffer,
			output,
			outputLength
		).slice();
		return JSON.parse(decoder.decode(bytes));
	} finally {
		wasmInstance.lsp_dealloc(input, request.length);
		if (output !== 0) wasmInstance.lsp_dealloc(output, outputLength);
	}
}
function send(message) {
	return sendTo(wasm, message);
}

const started = performance.now();
const init = send({
	jsonrpc: '2.0',
	id: 1,
	method: 'initialize',
	params: { capabilities: {}, initializationOptions: { phpVersion: '8.5' } },
});
const initializeResponseMs = performance.now() - started;
assert.equal(init.id, 1, 'request id is preserved');
assert.equal(
	init.result.serverInfo.version,
	'0.11.1+php-version-setting.1:php8.5',
	'engine confirms the custom PHP-version-setting build'
);
assert.ok(
	init.result.capabilities.completionProvider.resolveProvider,
	'completion resolve is advertised'
);
assert.equal(
	init.result.capabilities.hoverProvider,
	true,
	'hover is advertised'
);
assert.ok(
	init.result.capabilities.signatureHelpProvider,
	'signature help is advertised'
);
send({ jsonrpc: '2.0', method: 'initialized', params: {} });

const uri = 'file:///playground/phpantom-smoke.php';
const source = `<?php
class Widget {
    public function run(string $message): string { return $message; }
    public static function create(): self { return new self(); }
}
function makeWidget(): Widget { return new Widget(); }
$widget = makeWidget();
$widget->run('ready');
Widget::create();
$date = date_create();
$date->format('Y');
`;
const lines = source.split('\n');
const lineOf = (fragment) => lines.findIndex((line) => line.includes(fragment));
const positionAfter = (fragment, needle) => ({
	line: lineOf(fragment),
	character: lines[lineOf(fragment)].indexOf(needle) + needle.length,
});
send({
	jsonrpc: '2.0',
	method: 'textDocument/didOpen',
	params: {
		textDocument: { uri, languageId: 'php', version: 1, text: source },
	},
});

const request = (id, method, position, extra = {}) =>
	send({
		jsonrpc: '2.0',
		id,
		method,
		params: { textDocument: { uri }, position, ...extra },
	});
function completionItems(response) {
	return response.result?.items ?? response.result ?? [];
}
const memberCompletionPosition = positionAfter("$widget->run('ready');", '->');
const firstCompletionStarted = performance.now();
const instanceItems = completionItems(
	request(2, 'textDocument/completion', memberCompletionPosition)
);
const firstCompletionMs = performance.now() - firstCompletionStarted;
assert.ok(
	instanceItems.some((item) => item.label.startsWith('run')),
	'same-file inferred variable supports -> completion'
);

const warmCompletionStarted = performance.now();
const repeatedItems = completionItems(
	request(10, 'textDocument/completion', memberCompletionPosition)
);
const warmCompletionMs = performance.now() - warmCompletionStarted;
assert.ok(
	repeatedItems.some((item) => item.label.startsWith('run')),
	'repeated completion remains available'
);

const staticItems = completionItems(
	request(
		3,
		'textDocument/completion',
		positionAfter('Widget::create();', '::')
	)
);
assert.ok(
	staticItems.some((item) => item.label.startsWith('create')),
	'same-file class supports :: completion'
);

const builtinItems = completionItems(
	request(
		4,
		'textDocument/completion',
		positionAfter("$date->format('Y');", '->')
	)
);
assert.ok(
	builtinItems.some((item) => item.label.startsWith('format')),
	'built-in date_create return type supports -> completion'
);

const hover = request(
	5,
	'textDocument/hover',
	positionAfter("$widget->run('ready');", 'run')
);
assert.match(JSON.stringify(hover.result?.contents ?? ''), /run/);

const signature = request(
	6,
	'textDocument/signatureHelp',
	positionAfter("$widget->run('ready');", 'run(')
);
assert.match(JSON.stringify(signature.result?.signatures ?? ''), /message/);

const signatureUri = 'file:///playground/php-version.php';
const signatureSource = "<?php\nstrrchr(";
send({
	jsonrpc: '2.0',
	method: 'textDocument/didOpen',
	params: {
		textDocument: {
			uri: signatureUri,
			languageId: 'php',
			version: 1,
			text: signatureSource,
		},
	},
});
const php85Arguments = send({
	jsonrpc: '2.0',
	id: 11,
	method: 'textDocument/completion',
	params: {
		textDocument: { uri: signatureUri },
		position: { line: 1, character: 8 },
	},
});
assert.match(
	JSON.stringify(php85Arguments.result ?? ''),
	/before_needle/
);

const php74Wasi = new WASI(
	[],
	[],
	[
		new OpenFile(new File([])),
		ConsoleStdout.lineBuffered(() => {}),
		ConsoleStdout.lineBuffered(() => {}),
	]
);
const php74Instance = await WebAssembly.instantiate(module, {
	wasi_snapshot_preview1: php74Wasi.wasiImport,
});
php74Wasi.initialize(php74Instance);
const php74Wasm = php74Instance.exports;
const php74Init = sendTo(php74Wasm, {
	jsonrpc: '2.0',
	id: 1,
	method: 'initialize',
	params: { capabilities: {}, initializationOptions: { phpVersion: '7.4' } },
});
assert.equal(php74Init.error, undefined, '7.4 is accepted by the WASM engine');
assert.equal(
	php74Init.result.serverInfo.version,
	'0.11.1+php-version-setting.1:php7.4'
);
sendTo(php74Wasm, { jsonrpc: '2.0', method: 'initialized', params: {} });
sendTo(php74Wasm, {
	jsonrpc: '2.0',
	method: 'textDocument/didOpen',
	params: {
		textDocument: {
			uri: signatureUri,
			languageId: 'php',
			version: 1,
			text: signatureSource,
		},
	},
});
const php74Arguments = sendTo(php74Wasm, {
	jsonrpc: '2.0',
	id: 2,
	method: 'textDocument/completion',
	params: {
		textDocument: { uri: signatureUri },
		position: { line: 1, character: 8 },
	},
});
assert.doesNotMatch(
	JSON.stringify(php74Arguments.result ?? ''),
	/before_needle/
);

const resolved = send({
	jsonrpc: '2.0',
	id: 7,
	method: 'completionItem/resolve',
	params: instanceItems[0],
});
assert.equal(resolved.id, 7, 'resolve response keeps its request id');

assert.match(
	phpVersionInitializationError({ phpVersion: '8.2' }),
	/supports PHP 7.4 and 8.5/
);
assert.equal(phpVersionInitializationError({ phpVersion: '7.4' }), undefined);
assert.equal(phpVersionInitializationError({ phpVersion: '8.5' }), undefined);
assert.match(
	phpVersionInitializationError({ phpVersion: 82 }),
	/must be a string/
);
assert.equal(isStaleDocumentVersion(2, 2), true);
assert.equal(isStaleDocumentVersion(2, 1), true);
assert.equal(isStaleDocumentVersion(2, 3), false);

const unknownMethod = send({
	jsonrpc: '2.0',
	id: 8,
	method: 'textDocument/notImplemented',
	params: {},
});
assert.equal(
	unknownMethod.error?.code,
	-32601,
	'unknown request returns method not found'
);
assert.equal(
	send({ jsonrpc: '2.0', method: 'exit', params: {} }),
	null,
	'notification has no response'
);

console.log(`PHPantom engine ${init.result.serverInfo.version}`);
console.log(
	`PHP 7.4 engine ${php74Init.result.serverInfo.version}; named-argument completion is suppressed below PHP 8.0.`
);
console.log(`WASM: ${wasmBytes.byteLength} bytes`);
console.log(
	`module startup (local file read + compile + instantiate): ${moduleStartupMs.toFixed(2)} ms`
);
console.log(
	`initialize response (post-instantiation): ${initializeResponseMs.toFixed(2)} ms`
);
console.log(
	`first completion after didOpen: ${firstCompletionMs.toFixed(2)} ms`
);
console.log(`repeated completion: ${warmCompletionMs.toFixed(2)} ms`);
console.log(
	'LSP checks passed: initialize, completion, resolve, hover, signature help, error, notification.'
);
