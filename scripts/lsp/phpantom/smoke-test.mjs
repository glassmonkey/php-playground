import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { ConsoleStdout, File, OpenFile, WASI } from '@bjorn3/browser_wasi_shim';
import {
	isStaleDocumentVersion,
	phpVersionInitializationError,
} from '../../../src/lsp/phpantom/php-version.mjs';

const wasmPath =
	process.env.PHPANTOM_WASM_PATH ??
	new URL('../../../assets/lsp/phpantom/phpantom_lsp.wasm', import.meta.url);
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
function completionAt(wasmInstance, uri, sourceText, position, id) {
	sendTo(wasmInstance, {
		jsonrpc: '2.0',
		method: 'textDocument/didOpen',
		params: {
			textDocument: {
				uri,
				languageId: 'php',
				version: 1,
				text: sourceText,
			},
		},
	});
	return sendTo(wasmInstance, {
		jsonrpc: '2.0',
		id,
		method: 'textDocument/completion',
		params: { textDocument: { uri }, position },
	});
}
function completionRequest(wasmInstance, uri, position, id) {
	return sendTo(wasmInstance, {
		jsonrpc: '2.0',
		id,
		method: 'textDocument/completion',
		params: { textDocument: { uri }, position },
	});
}
function changeDocument(wasmInstance, uri, version, text) {
	return sendTo(wasmInstance, {
		jsonrpc: '2.0',
		method: 'textDocument/didChange',
		params: {
			textDocument: { uri, version },
			contentChanges: [{ text }],
		},
	});
}
function resolveCompletionItem(wasmInstance, item, id) {
	return sendTo(wasmInstance, {
		jsonrpc: '2.0',
		id,
		method: 'completionItem/resolve',
		params: item,
	});
}
function signatureAt(wasmInstance, uri, functionName, id) {
	sendTo(wasmInstance, {
		jsonrpc: '2.0',
		method: 'textDocument/didOpen',
		params: {
			textDocument: {
				uri,
				languageId: 'php',
				version: 1,
				text: `<?php\n${functionName}(`,
			},
		},
	});
	return sendTo(wasmInstance, {
		jsonrpc: '2.0',
		id,
		method: 'textDocument/signatureHelp',
		params: {
			textDocument: { uri },
			position: { line: 1, character: functionName.length + 1 },
		},
	});
}
function freshPhpVersionEngine(phpVersion) {
	const versionWasi = new WASI(
		[],
		[],
		[
			new OpenFile(new File([])),
			ConsoleStdout.lineBuffered(() => {}),
			ConsoleStdout.lineBuffered(() => {}),
		]
	);
	const versionInstance = new WebAssembly.Instance(module, {
		wasi_snapshot_preview1: versionWasi.wasiImport,
	});
	versionWasi.initialize(versionInstance);
	const versionWasm = versionInstance.exports;
	const versionInit = sendTo(versionWasm, {
		jsonrpc: '2.0',
		id: 1,
		method: 'initialize',
		params: {
			capabilities: {},
			initializationOptions: { phpVersion },
		},
	});
	assert.equal(
		versionInit.result.serverInfo.version,
		`0.11.1+php-version-setting.1:php${phpVersion}`
	);
	sendTo(versionWasm, {
		jsonrpc: '2.0',
		method: 'initialized',
		params: {},
	});
	return versionWasm;
}
const php85Arguments = completionAt(
	wasm,
	signatureUri,
	signatureSource,
	{ line: 1, character: 8 },
	11
);
assert.match(
	JSON.stringify(php85Arguments.result ?? ''),
	/before_needle/
);
const php85StringFunctions = completionItems(
	completionAt(
		wasm,
		'file:///playground/php-version-str.php',
		'<?php\nstr_c',
		{ line: 1, character: 5 },
		12
	)
);
assert.ok(
	php85StringFunctions.some((item) => item.label.startsWith('str_contains')),
	'PHP 8.5 exposes the PHP 8.0 str_contains stub'
);
const php85StrContainsItem = php85StringFunctions.find((item) =>
	item.label.startsWith('str_contains')
);
const php85ResolvedStrContains = sendTo(wasm, {
	jsonrpc: '2.0',
	id: 14,
	method: 'completionItem/resolve',
	params: php85StrContainsItem,
});
assert.match(
	JSON.stringify(php85ResolvedStrContains.result ?? ''),
	/haystack/,
	'PHP 8.5 resolves str_contains from the available stub'
);
const php85StrContainsSignature = sendTo(wasm, {
	jsonrpc: '2.0',
	id: 15,
	method: 'textDocument/didOpen',
	params: {
		textDocument: {
			uri: 'file:///playground/php-version-str-signature.php',
			languageId: 'php',
			version: 1,
			text: '<?php\nstr_contains(',
		},
	},
});
assert.equal(php85StrContainsSignature, null);
const php85SignatureResponse = sendTo(wasm, {
	jsonrpc: '2.0',
	id: 16,
	method: 'textDocument/signatureHelp',
	params: {
		textDocument: {
			uri: 'file:///playground/php-version-str-signature.php',
		},
		position: { line: 1, character: 13 },
	},
});
assert.match(
	JSON.stringify(php85SignatureResponse.result?.signatures ?? ''),
	/haystack/,
	'PHP 8.5 resolves str_contains signature metadata'
);
const php85ArrayFunctions = completionItems(
	completionAt(
		wasm,
		'file:///playground/php-version-array.php',
		'<?php\narray_f',
		{ line: 1, character: 7 },
		13
	)
);
for (const name of ['array_first', 'array_find', 'array_find_key']) {
	assert.ok(
		php85ArrayFunctions.some((item) => item.label.startsWith(name)),
		`PHP 8.5 exposes the ${name} stub`
	);
}
const php85ArrayLastUri = 'file:///playground/php-version-array-last.php';
const php85ArrayLastItems = completionItems(
	completionAt(
		wasm,
		php85ArrayLastUri,
		'<?php\narray_l',
		{ line: 1, character: 8 },
		17
	)
);
assert.ok(
	php85ArrayLastItems.some((item) => item.label.startsWith('array_last')),
	'PHP 8.5 exposes the PHP 8.5 array_last stub'
);
for (const name of [
	'array_first',
	'array_last',
	'array_find',
	'array_find_key',
]) {
	const item = [...php85ArrayFunctions, ...php85ArrayLastItems].find((candidate) =>
		candidate.label.startsWith(name)
	);
	assert.ok(item, `PHP 8.5 has a completion item for ${name}`);
	const resolved = resolveCompletionItem(wasm, item, 30 + name.length);
	assert.match(
		JSON.stringify(resolved?.result ?? ''),
		new RegExp(name),
		`PHP 8.5 resolves ${name}`
	);
	const signature = signatureAt(
		wasm,
		`file:///playground/php-version-signature-${name}.php`,
		name,
		40 + name.length
	);
	assert.ok(
		signature.result?.signatures?.length,
		`PHP 8.5 provides signature help for ${name}`
	);
}

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
const php74Arguments = completionAt(
	php74Wasm,
	signatureUri,
	signatureSource,
	{ line: 1, character: 8 },
	2
);
assert.doesNotMatch(
	JSON.stringify(php74Arguments.result ?? ''),
	/before_needle/
);
const php74StringFunctions = completionItems(
	completionAt(
		php74Wasm,
		'file:///playground/php-version-str.php',
		'<?php\nstr_c',
		{ line: 1, character: 5 },
		3
	)
);
assert.ok(
	!php74StringFunctions.some((item) => item.label.startsWith('str_contains')),
	'PHP 7.4 excludes the PHP 8.0 str_contains stub'
);
const php74SignatureUri = 'file:///playground/php-version-str-signature.php';
sendTo(php74Wasm, {
	jsonrpc: '2.0',
	method: 'textDocument/didOpen',
	params: {
		textDocument: {
			uri: php74SignatureUri,
			languageId: 'php',
			version: 1,
			text: '<?php\nstr_contains(',
		},
	},
});
const php74StrContainsSignature = sendTo(php74Wasm, {
	jsonrpc: '2.0',
	id: 6,
	method: 'textDocument/signatureHelp',
	params: {
		textDocument: { uri: php74SignatureUri },
		position: { line: 1, character: 13 },
	},
});
assert.equal(
	php74StrContainsSignature.result,
	null,
	'PHP 7.4 does not resolve a signature for the unavailable stub'
);
const php74ArrayFunctions = completionItems(
	completionAt(
		php74Wasm,
		'file:///playground/php-version-array.php',
		'<?php\narray_f',
		{ line: 1, character: 7 },
		4
	)
);
for (const name of ['array_first', 'array_find', 'array_find_key']) {
	assert.ok(
		!php74ArrayFunctions.some((item) => item.label.startsWith(name)),
		`PHP 7.4 excludes the ${name} stub after a fresh initialization`
	);
}
const php74ExistingFunctions = completionItems(
	completionAt(
		php74Wasm,
		'file:///playground/php-version-existing.php',
		'<?php\nstrl',
		{ line: 1, character: 4 },
		5
	)
);
assert.ok(
	php74ExistingFunctions.some((item) => item.label.startsWith('strlen')),
	'PHP 7.4 retains the existing strlen builtin'
);
const php74UserFunctions = completionItems(
	completionAt(
		php74Wasm,
		'file:///playground/php-version-user-function.php',
		'<?php\n/** @since 8.5 */\nfunction userFutureApi(): void {}\nuserF',
		{ line: 3, character: 5 },
		7
	)
);
assert.ok(
	php74UserFunctions.some((item) => item.label.startsWith('userFutureApi')),
	'PHP 7.4 keeps user-defined functions regardless of their @since docblock'
);
for (const [cycleIndex, phpVersion] of ['7.4', '8.5', '7.4'].entries()) {
	const cycleWasm = freshPhpVersionEngine(phpVersion);
	const expectedInVersion = phpVersion === '8.5';
	const coldStrItems = completionItems(
		completionAt(
			cycleWasm,
			`file:///playground/php-version-cycle-${cycleIndex}-str-cold.php`,
			'<?php\nstr_c',
			{ line: 1, character: 5 },
			19
		)
	);
	assert.equal(
		coldStrItems.some((item) => item.filterText === 'str_contains'),
		expectedInVersion,
		`fresh-engine ${phpVersion} cold str_contains availability`
	);
	const strUri = `file:///playground/php-version-cycle-${cycleIndex}-str.php`;
	const strlenItems = completionItems(
		completionAt(cycleWasm, strUri, '<?php\nstrl', { line: 1, character: 4 }, 20)
	);
	const strlenItem = strlenItems.find((item) => item.filterText === 'strlen');
	assert.ok(strlenItem, `${phpVersion} cycle retains strlen`);
	assert.match(
		JSON.stringify(resolveCompletionItem(cycleWasm, strlenItem, 21)?.result ?? ''),
		/strlen/,
		`${phpVersion} cycle resolves strlen before newer string-function check`
	);
	changeDocument(cycleWasm, strUri, 2, '<?php\nstr_c');
	const strItems = completionItems(
		completionRequest(cycleWasm, strUri, { line: 1, character: 5 }, 22)
	);
	assert.equal(
		strItems.some((item) => item.filterText === 'str_contains'),
		expectedInVersion,
		`fresh-engine ${phpVersion} cycle filters str_contains after strlen resolve`
	);
	const strSignature = signatureAt(
		cycleWasm,
		`file:///playground/php-version-cycle-${cycleIndex}-str-signature.php`,
		'str_contains',
		23
	);
	if (phpVersion === '8.5') {
		const strItem = strItems.find((item) => item.filterText === 'str_contains');
		assert.ok(strItem);
		assert.match(
			JSON.stringify(resolveCompletionItem(cycleWasm, strItem, 24)?.result ?? ''),
			/haystack/
		);
		assert.ok(strSignature.result?.signatures?.length);
	} else {
		assert.equal(strSignature.result, null);
	}

	const arrayUri = `file:///playground/php-version-cycle-${cycleIndex}-array.php`;
	const arrayItems = completionItems(
		completionAt(cycleWasm, arrayUri, '<?php\narray_f', { line: 1, character: 7 }, 25)
	);
	for (const name of ['array_first', 'array_find', 'array_find_key']) {
		assert.equal(
			arrayItems.some((item) => item.filterText === name),
			expectedInVersion,
			`fresh-engine ${phpVersion} cold ${name} availability`
		);
	}
	const arrayLastColdItems = completionItems(
		completionAt(
			cycleWasm,
			`file:///playground/php-version-cycle-${cycleIndex}-array-last-cold.php`,
			'<?php\narray_l',
			{ line: 1, character: 8 },
			29
		)
	);
	assert.equal(
		arrayLastColdItems.some((item) => item.filterText === 'array_last'),
		expectedInVersion,
		`fresh-engine ${phpVersion} cold array_last availability`
	);
	const arrayFillItem = arrayItems.find((item) => item.filterText === 'array_fill');
	assert.ok(arrayFillItem, `${phpVersion} cycle retains array_fill`);
	assert.match(
		JSON.stringify(resolveCompletionItem(cycleWasm, arrayFillItem, 26)?.result ?? ''),
		/array_fill/,
		`${phpVersion} cycle resolves array_fill before versioned array checks`
	);
	const warmArrayItems = completionItems(
		completionRequest(cycleWasm, arrayUri, { line: 1, character: 7 }, 27)
	);
	for (const name of ['array_first', 'array_find', 'array_find_key']) {
		assert.equal(
			warmArrayItems.some((item) => item.filterText === name),
			expectedInVersion,
			`fresh-engine ${phpVersion} cycle filters ${name} after array_fill resolve`
		);
		const signature = signatureAt(
			cycleWasm,
			`file:///playground/php-version-cycle-${cycleIndex}-${name}-signature.php`,
			name,
			28 + name.length
		);
		if (phpVersion === '8.5') {
			const item = warmArrayItems.find((candidate) => candidate.filterText === name);
			assert.ok(item);
			assert.match(
				JSON.stringify(resolveCompletionItem(cycleWasm, item, 38 + name.length)?.result ?? ''),
				new RegExp(name)
			);
			assert.ok(signature.result?.signatures?.length);
		} else {
			assert.equal(signature.result, null);
		}
	}
	changeDocument(cycleWasm, arrayUri, 2, '<?php\narray_l');
	const arrayLastItems = completionItems(
		completionRequest(cycleWasm, arrayUri, { line: 1, character: 8 }, 50)
	);
	assert.equal(
		arrayLastItems.some((item) => item.filterText === 'array_last'),
		expectedInVersion,
		`fresh-engine ${phpVersion} cycle filters array_last after array_fill resolve`
	);
	const arrayLastSignature = signatureAt(
		cycleWasm,
		`file:///playground/php-version-cycle-${cycleIndex}-array-last-signature.php`,
		'array_last',
		51
	);
	if (phpVersion === '8.5') {
		const item = arrayLastItems.find((candidate) => candidate.filterText === 'array_last');
		assert.ok(item);
		assert.match(
			JSON.stringify(resolveCompletionItem(cycleWasm, item, 52)?.result ?? ''),
			/array_last/
		);
		assert.ok(arrayLastSignature.result?.signatures?.length);
	} else {
		assert.equal(arrayLastSignature.result, null);
	}
	const userFunctions = completionItems(
		completionAt(
			cycleWasm,
			`file:///playground/php-version-cycle-${cycleIndex}-user.php`,
			'<?php\n/** @since 8.5 */\nfunction cycleUserFutureApi(): void {}\ncycleUserF',
			{ line: 3, character: 10 },
			53
		)
	);
	assert.ok(
		userFunctions.some((item) => item.label.startsWith('cycleUserFutureApi')),
		`fresh-engine ${phpVersion} cycle leaves user-source @since untouched`
	);
}

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
