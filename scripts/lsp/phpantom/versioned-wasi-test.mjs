import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { WASI } from 'node:wasi';

const manifestPath = process.argv[2];
assert.ok(manifestPath, 'usage: node versioned-wasi-test.mjs <artifact-provenance.json>');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const target = manifest.phpTarget;
assert.ok(['7.4', '8.0', '8.3', '8.5'].includes(target), `unverified target ${target}`);
assert.equal(manifest.phase, 'B');
assert.equal(manifest.source?.commit, '49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668');
const reviewedDiff = manifest.source?.reviewedPhaseBDiffSha256
	?? manifest.source?.reviewedPatchSha256;
assert.equal(reviewedDiff,
	'e12de7944592edf7f38fc8fcf4a5a6065468600329641bd24bb8ae48d4fd260d');
if (manifest.source?.appliedPhaseBPatchSha256) {
	assert.equal(manifest.source.appliedPhaseBPatchSha256,
		'4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d');
} else {
	assert.equal(manifest.source?.reviewedSourceBundleSha256,
		'60aad10373b97a65da73196aa28e6893a77480a21d5687ad1b140e6d74bd30a3',
		'legacy frozen-artifact provenance identifies the verified source bundle');
}
assert.equal(manifest.stubs?.commit, '2049ca3cfa1feabf52db074108fe776a5713cf02');
const buildIdentity = manifest.buildIdentity
	?? manifest.build?.command.match(/PHPANTOM_GIT_VERSION=([^ ]+)/)?.[1];
assert.ok(buildIdentity, 'provenance must record the exact initialize build identity');
const artifactRecord = manifest.artifact;
const artifactPath = path.resolve(path.dirname(manifestPath), artifactRecord.path ?? artifactRecord.file);
const bytes = await readFile(artifactPath);
const actualSha = createHash('sha256').update(bytes).digest('hex');
assert.equal(actualSha, artifactRecord.sha256, 'artifact bytes match provenance SHA-256');
assert.equal(bytes.byteLength, artifactRecord.bytes, 'artifact bytes match provenance size');

const wasi = new WASI({ version: 'preview1', args: [], env: {} });
const module = await WebAssembly.compile(bytes);
const instance = await WebAssembly.instantiate(module, wasi.getImportObject());
wasi.initialize(instance);
for (const name of ['memory', 'lsp_alloc', 'lsp_dealloc', 'lsp_handle', 'lsp_response_len']) {
	assert.ok(name in instance.exports, `WASI artifact exports ${name}`);
}
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
let nextId = 1;
let assertions = 0;
const knownLimits = [];

function send(message) {
	const requestBytes = encoder.encode(JSON.stringify(message));
	const input = instance.exports.lsp_alloc(requestBytes.length);
	assert.notEqual(input, 0, `${message.method} allocates request memory`);
	new Uint8Array(instance.exports.memory.buffer, input, requestBytes.length).set(requestBytes);
	let output = 0;
	let outputLength = 0;
	try {
		output = instance.exports.lsp_handle(input, requestBytes.length);
		if (output === 0) {
			assert.equal(instance.exports.lsp_response_len(), 0, `${message.method} notification has no response`);
			return null;
		}
		outputLength = instance.exports.lsp_response_len();
		return JSON.parse(decoder.decode(
			new Uint8Array(instance.exports.memory.buffer, output, outputLength).slice(),
		));
	} finally {
		instance.exports.lsp_dealloc(input, requestBytes.length);
		if (output !== 0) instance.exports.lsp_dealloc(output, outputLength);
	}
}

function check(label, condition, actual) {
	assert.ok(condition, `${label}: ${JSON.stringify(actual)}`);
	assertions += 1;
	console.log(`PASS ${label}`);
}

function request(method, params) {
	const id = nextId++;
	const response = send({ jsonrpc: '2.0', id, method, params });
	assert.ok(response, `${method} returns a response`);
	assert.equal(response.id, id, `${method} preserves its request id`);
	assert.equal(response.error, undefined, `${method} has no JSON-RPC error`);
	return response;
}

function notify(method, params) {
	assert.equal(send({ jsonrpc: '2.0', method, params }), null);
}

function initialize() {
	const response = request('initialize', {
		capabilities: {},
		initializationOptions: { phpVersion: target },
	});
	assert.equal(response.result?.serverInfo?.version, buildIdentity);
	check(`${target} initialize reports build identity`, true, response.result.serverInfo);
	notify('initialized', {});
}

function open(uri, text) {
	notify('textDocument/didOpen', {
		textDocument: { uri, languageId: 'php', version: 1, text },
	});
}

function positionAfter(source, marker, occurrence = 0) {
	let offset = -1;
	for (let index = 0; index <= occurrence; index += 1) {
		offset = source.indexOf(marker, offset + 1);
		assert.notEqual(offset, -1, `fixture contains ${marker}`);
	}
	const prefix = source.slice(0, offset + marker.length);
	const lastNewline = prefix.lastIndexOf('\n');
	return {
		line: prefix.split('\n').length - 1,
		character: prefix.length - lastNewline - 1,
	};
}

function completionItems(response) {
	const result = response?.result;
	if (Array.isArray(result)) return result;
	if (Array.isArray(result?.items)) return result.items;
	return [];
}

function completion(uri, source, marker, occurrence = 0) {
	return request('textDocument/completion', {
		textDocument: { uri },
		position: positionAfter(source, marker, occurrence),
	});
}

function hasFunction(items, name) {
	return items.some((item) => item.filterText === name || item.label === name
		|| item.label?.startsWith(`${name}(`));
}

function versionedBuiltinAvailability() {
	const expected = target === '8.5';
	for (const [prefix, name] of [
		['str_c', 'str_contains'],
		['array_f', 'array_first'],
		['array_l', 'array_last'],
	]) {
		const uri = `file:///phase-b/${target}/${name}.php`;
		const source = `<?php\n${prefix}`;
		open(uri, source);
		const items = completionItems(completion(uri, source, prefix));
		check(`${target} ${name} initial availability is ${expected}`, hasFunction(items, name) === expected, items);
	}

	const siblingUri = `file:///phase-b/${target}/abs.php`;
	const siblingSource = '<?php\nabs';
	open(siblingUri, siblingSource);
	const siblingItems = completionItems(completion(siblingUri, siblingSource, 'abs'));
	const abs = siblingItems.find((item) => item.filterText === 'abs');
	check(`${target} sibling abs resolves`, Boolean(abs), siblingItems);
	if (abs) request('completionItem/resolve', abs);

	const warmUri = `file:///phase-b/${target}/warm-str.php`;
	const warmSource = '<?php\nstr_c';
	open(warmUri, warmSource);
	const warmItems = completionItems(completion(warmUri, warmSource, 'str_c'));
	check(`${target} str_contains remains version-correct after sibling resolve`,
		hasFunction(warmItems, 'str_contains') === expected, warmItems);
}

function namedArgumentFeature() {
	const uri = `file:///phase-b/${target}/named-arguments.php`;
	const source = '<?php\nfunction profile_named(string $firstOption, string $secondOption): void {}\nprofile_named(';
	open(uri, source);
	const items = completionItems(completion(uri, source, 'profile_named(', 1));
	const present = items.some((item) => item.filterText === 'firstOption');
	const expected = Number(target.split('.')[0]) >= 8;
	check(`${target} named-argument suggestions follow the PHP 8 feature boundary`, present === expected, items);
}

function userSymbolsAndBaselineDocs() {
	const uri = `file:///phase-b/${target}/user-symbols.php`;
	const source = [
		'<?php',
		'namespace EvalProbe;',
		'/** EVAL_USER_SAME_NAME_MARKER */',
		'function str_contains(string $haystack, string $needle): bool {}',
		'function local_probe_function(string $label): void {}',
		'class LocalProbe { public function member_probe(): void {} }',
		'$localProbe = new LocalProbe();',
		'str_con',
		'local_probe_f',
		'$localP',
		'$localProbe->',
	].join('\n');
	open(uri, source);
	const userItems = completionItems(completion(uri, source, 'str_con', 1));
	const userFunction = userItems.find((item) => item.filterText === 'str_contains'
		&& item.data?.m === 'EvalProbe\\str_contains');
	check(`${target} same-name user function retains its FQN`, Boolean(userFunction), userItems);
	if (userFunction) {
		const resolved = request('completionItem/resolve', userFunction).result;
		check(`${target} same-name user function retains signature`, resolved?.detail === 'bool', resolved);
		const hasMarker = JSON.stringify(resolved).includes('EVAL_USER_SAME_NAME_MARKER');
		if (!hasMarker) {
			knownLimits.push('same-name user documentation marker absent; matches the corrected Phase A baseline');
			console.log(`KNOWN_LIMIT ${target} same-name user docs marker absent (baseline case)`);
		}
	}
	for (const [marker, expected] of [
		['local_probe_f', 'local_probe_function'],
		['$localP', '$localProbe'],
		['$localProbe->', 'member_probe'],
	]) {
		const occurrence = marker === 'local_probe_f' || marker === '$localP' ? 1 : 0;
		const items = completionItems(completion(uri, source, marker, occurrence));
		const present = items.some((item) => item.label?.includes(expected)
			|| item.filterText?.includes(expected));
		check(`${target} ordinary ${expected} completion remains available`, present, items);
	}
}

function strrchrBoundary() {
	const expected = target === '8.3';
	const source = '<?php\nstrrchr("haystack", "needle",';
	const uri = `file:///phase-b/${target}/strrchr-parameter.php`;
	open(uri, source);
	const parameterItems = completionItems(completion(uri, source, 'strrchr("haystack", "needle",'));
	const parameterPresent = JSON.stringify(parameterItems).includes('before_needle');
	check(`${target} strrchr completion parameter boundary is ${expected}`, parameterPresent === expected, parameterItems);

	const signature = request('textDocument/signatureHelp', {
		textDocument: { uri },
		position: positionAfter(source, 'strrchr("haystack", "needle",'),
	}).result?.signatures?.[0]?.label;
	check(`${target} strrchr signature parameter boundary is ${expected}`,
		typeof signature === 'string' && signature.includes('before_needle') === expected, signature);

	const builtinUri = `file:///phase-b/${target}/strrchr-builtin.php`;
	const builtinSource = '<?php\nstrr';
	open(builtinUri, builtinSource);
	const builtinItems = completionItems(completion(builtinUri, builtinSource, 'strr'));
	const builtin = builtinItems.find((item) => item.data?.m === 'strrchr' && item.filterText === 'strrchr');
	check(`${target} builtin strrchr completion has exact identity`, Boolean(builtin), builtinItems);
	if (builtin) {
		const resolved = request('completionItem/resolve', builtin).result;
		const docs = typeof resolved?.documentation === 'string'
			? resolved.documentation : resolved?.documentation?.value ?? '';
		check(`${target} builtin strrchr resolved docs follow the boundary`,
			docs.includes('before_needle') === expected, docs);
	}

	const userUri = `file:///phase-b/${target}/user-strrchr.php`;
	const userSource = [
		'<?php',
		'namespace EvalProbe;',
		'function strrchr(string $userNeedle, int $userMode): void {}',
		'strrchr(',
	].join('\n');
	open(userUri, userSource);
	const userSignature = request('textDocument/signatureHelp', {
		textDocument: { uri: userUri },
		position: positionAfter(userSource, 'strrchr(', 1),
	}).result?.signatures?.[0]?.label ?? '';
	check(`${target} same-name user strrchr signature keeps its parameters`,
		userSignature.includes('userNeedle') && userSignature.includes('userMode'), userSignature);
	const userNamed = completionItems(completion(userUri, userSource, 'strrchr(', 1));
	const serialized = JSON.stringify(userNamed);
	check(`${target} same-name user strrchr named parameters survive`,
		serialized.includes('userNeedle') && serialized.includes('userMode')
			&& !serialized.includes('before_needle'), userNamed);
}

initialize();
if (target === '7.4' || target === '8.5') {
	versionedBuiltinAvailability();
	namedArgumentFeature();
	userSymbolsAndBaselineDocs();
} else {
	strrchrBoundary();
	userSymbolsAndBaselineDocs();
}
console.log(JSON.stringify({
	target,
	artifactSha256: actualSha,
	buildIdentity,
	assertionsPassed: assertions,
	knownLimits,
}, null, 2));
