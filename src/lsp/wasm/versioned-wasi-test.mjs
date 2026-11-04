import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { WASI } from 'node:wasi';

const manifestPath = process.argv[2];
assert.ok(manifestPath, 'usage: node versioned-wasi-test.mjs <artifact-provenance.json>');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const target = manifest.phpTarget;
const supportedTargets = ['5.6', '7.0', '7.1', '7.2', '7.3', '7.4', '8.0', '8.1', '8.2', '8.3', '8.4', '8.5'];
assert.ok(supportedTargets.includes(target), `unverified target ${target}`);
assert.equal(manifest.phase, 'B');
assert.equal(manifest.source?.commit, '49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668');
const reviewedDiff = manifest.source?.reviewedPhaseBDiffSha256
	?? manifest.source?.reviewedPatchSha256;
assert.equal(reviewedDiff,
	'e12de7944592edf7f38fc8fcf4a5a6065468600329641bd24bb8ae48d4fd260d');
if (manifest.source?.appliedPhaseBPatchSha256) {
	assert.equal(manifest.source.appliedPhaseBPatchSha256,
		'fdd3267c72b39cbe3024d38d7ddadee7e651c64c622162db1fcc00706f19afc5');
	assert.equal(manifest.source.appliedFileManifestSha256,
		'7362df153e9f57f2bd74eb7b69d9320d27048841fbca90931b399437b054fc27');
} else {
	assert.equal(manifest.source?.reviewedSourceBundleSha256,
		'60aad10373b97a65da73196aa28e6893a77480a21d5687ad1b140e6d74bd30a3',
		'legacy frozen-artifact provenance identifies the verified source bundle');
}
assert.equal(manifest.stubs?.commit, '2049ca3cfa1feabf52db074108fe776a5713cf02');
if (manifest.stubs?.resolvedCommitMarker) {
	assert.equal(manifest.stubs.resolvedCommitMarker, manifest.stubs.commit,
		'the verified build-output .commit marker is the full locked stub commit');
	assert.equal(manifest.stubs.fullEmbeddedStubs, true);
	assert.match(manifest.stubs.mapSha256, /^[a-f0-9]{64}$/);
}
const buildIdentity = manifest.buildIdentity
	?? manifest.build?.command.match(/PHPANTOM_GIT_VERSION=([^ ]+)/)?.[1];
assert.ok(buildIdentity, 'provenance must record the exact initialize build identity');
const artifactRecord = manifest.artifact;
const artifactPath = path.resolve(path.dirname(manifestPath), artifactRecord.path ?? artifactRecord.file);
const bytes = await readFile(artifactPath);
const actualSha = createHash('sha256').update(bytes).digest('hex');
assert.equal(actualSha, artifactRecord.sha256, 'artifact bytes match provenance SHA-256');
assert.equal(bytes.byteLength, artifactRecord.bytes, 'artifact bytes match provenance size');

let wasi = new WASI({ version: 'preview1', args: [], env: {} });
const module = await WebAssembly.compile(bytes);
let instance = await WebAssembly.instantiate(module, wasi.getImportObject());
wasi.initialize(instance);
for (const name of ['memory', 'lsp_alloc', 'lsp_dealloc', 'lsp_handle', 'lsp_response_len']) {
	assert.ok(name in instance.exports, `WASI artifact exports ${name}`);
}
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
let nextId = 1;
let assertions = 0;
const [targetMajor, targetMinor] = target.split('.').map(Number);

function targetAtLeast(major, minor) {
	return targetMajor > major || (targetMajor === major && targetMinor >= minor);
}

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
	const cases = [
		['str_c', 'str_contains', targetAtLeast(8, 0)],
		['array_f', 'array_first', targetAtLeast(8, 5)],
		['array_l', 'array_last', targetAtLeast(8, 5)],
	];
	for (const [prefix, name, expected] of cases) {
		const uri = `file:///phase-b/${target}/${name}.php`;
		const source = `<?php\n${prefix}`;
		open(uri, source);
		const items = completionItems(completion(uri, source, prefix));
		check(`${target} ${name} cold availability is ${expected}`, hasFunction(items, name) === expected, items);
	}

	const siblingUri = `file:///phase-b/${target}/abs.php`;
	const siblingSource = '<?php\nabs';
	open(siblingUri, siblingSource);
	const siblingItems = completionItems(completion(siblingUri, siblingSource, 'abs'));
	const abs = siblingItems.find((item) => item.filterText === 'abs');
	check(`${target} sibling abs resolves`, Boolean(abs), siblingItems);
	if (abs) request('completionItem/resolve', abs);

	for (const [prefix, name, expected] of cases) {
		const warmUri = `file:///phase-b/${target}/warm-${name}.php`;
		const warmSource = `<?php\n${prefix}`;
		open(warmUri, warmSource);
		const warmItems = completionItems(completion(warmUri, warmSource, prefix));
		check(`${target} ${name} warm availability after sibling resolve is ${expected}`,
			hasFunction(warmItems, name) === expected, warmItems);
	}
}

function namedArgumentFeature() {
	const uri = `file:///phase-b/${target}/named-arguments.php`;
	const source = '<?php\nfunction profile_named(string $firstOption, string $secondOption): void {}\nprofile_named(';
	open(uri, source);
	const items = completionItems(completion(uri, source, 'profile_named(', 1));
	const present = items.some((item) => item.filterText === 'firstOption');
	const expected = targetAtLeast(8, 0);
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
		check(`${target} same-name user function retains documentation`, hasMarker, resolved);
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
	const expected = targetAtLeast(8, 3);
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
	const namedParametersPresent = serialized.includes('userNeedle') && serialized.includes('userMode');
	const expectedNamedParameters = targetAtLeast(8, 0);
	check(`${target} same-name user strrchr named-argument suggestions follow the PHP 8 boundary`,
		namedParametersPresent === expectedNamedParameters
			&& (!expectedNamedParameters || !serialized.includes('before_needle')), userNamed);
}

async function releaseFamilyOracle() {
    const rows=(await readFile(new URL('./native-probe/tests/fixtures/minimum-availability.tsv',import.meta.url),'utf8')).split('\n')
        .filter(line=>line && !line.startsWith('#')).map(line=>line.split('\t')).filter(row=>row[0]===target);
    assert.equal(rows.length,14,'the independent minimum oracle has 14 declarations per target');
    for (const [,family,symbol,available,location] of rows) {
        // Fresh engine per case: a previous fixture cannot warm the cold result.
        wasi=new WASI({version:'preview1',args:[],env:{}});
        instance=await WebAssembly.instantiate(module,wasi.getImportObject());wasi.initialize(instance);initialize();
        const tail=family==='class'?`new ${symbol.slice(0,-1)}`:family==='interface'?`function f(${symbol.slice(0,-1)}`:family==='member'?'DateTime::createFromI':symbol.slice(0,-1);
        const uri=`file:///release/${family}/${symbol.replaceAll('\\','_').replaceAll('::','_')}.php`;const source=`<?php\n${tail}`;open(uri,source);
        const offered=items=>items.some(item=>item.data?.m===symbol || item.filterText===symbol || item.label===symbol.split('\\').at(-1) || item.label?.startsWith(symbol.split('::').at(-1)+'('));
        const get=()=>completionItems(request('textDocument/completion',{textDocument:{uri},position:{line:source.split('\n').length-1,character:tail.length}}));
        check(`${target} ${family} ${symbol} cold`,offered(get())===(available==='true'),{expected:available,location});
        const siblings={
            'random/random.php':['mt_ran','mt_rand'], 'standard/standard_9.php':['array_chun','array_chunk'],
            'standard/standard_3.php':['ab','abs'], 'Core/Core_c.php':['new Exceptio','Exception'],
            'Core/Core_d.php':['PHP_O','PHP_OS'], 'json/json.php':['json_encod','json_encode'],
            'date/date_c.php':['new DateTim','DateTime'], 'Core/Core.php':['class_exist','class_exists'],
        };
        const [prefix,warmSymbol]=siblings[location.split(':')[0]];const warmUri='file:///release/warm.php';const warmSource=`<?php\n${prefix}`;open(warmUri,warmSource);
        const sibling=completionItems(completion(warmUri,warmSource,prefix)).find(item=>item.data?.m===warmSymbol);
        check(`${target} ${symbol} shared-source sibling exists`,Boolean(sibling),warmSymbol);
        request('completionItem/resolve',sibling);
        check(`${target} ${family} ${symbol} warm`,offered(get())===(available==='true'),{expected:available,location});
    }
}
function applyCompletion(source, item) {
    assert.ok(item?.textEdit?.range, 'function completion carries an explicit replacement range');
    const offset = position => source.split('\n').slice(0, position.line)
        .reduce((sum, line) => sum + line.length + 1, 0) + position.character;
    const edits = [item.textEdit, ...(item.additionalTextEdits ?? [])]
        .sort((a, b) => offset(b.range.start) - offset(a.range.start));
    return edits.reduce((text, edit) => text.slice(0, offset(edit.range.start))
        + edit.newText + text.slice(offset(edit.range.end)), source);
}

async function freshEngine() {
    wasi = new WASI({ version: 'preview1', args: [], env: {} });
    instance = await WebAssembly.instantiate(module, wasi.getImportObject());
    wasi.initialize(instance);
    initialize();
}

async function releaseInsertionIdentity() {
    for (const warm of [false, true]) {
        await freshEngine();
        const uri = 'file:///release/binding.php';
        const source = '<?php\nnamespace ReleaseBinding;\n/** USER_BINDING_DOC */\nfunction strlen(string $ownOnly): bool { return true; }\n\\strle';
        open(uri, source);
        if (warm) {
            const siblingUri = 'file:///release/sibling.php';
            const siblingSource = '<?php\nstrle';
            open(siblingUri, siblingSource);
            const sibling = completionItems(completion(siblingUri, siblingSource, 'strle'))
                .find(item => item.data?.m === 'strlen');
            assert.ok(sibling, 'the public sibling request finds the builtin');
            request('completionItem/resolve', sibling);
        }
        const items = completionItems(completion(uri, source, '\\strle'));
        const global = items.find(item => item.data?.m === 'strlen');
        const user = items.find(item => item.data?.m === 'ReleaseBinding\\strlen');
        const globalCall = warm ? '\\strlen(${1:\\$string})$0' : '\\strlen()$0';
        const common = source.slice(0, source.lastIndexOf('\\strle'));
        check(`${target} global full edit preserves identity warm=${warm}`,
            applyCompletion(source, global) === common + globalCall, global);
        check(`${target} user full edit preserves identity warm=${warm}`,
            applyCompletion(source, user) === common + 'strlen(${1:\\$ownOnly})$0', user);
        const globalDoc = JSON.stringify(request('completionItem/resolve', global).result);
        const userDoc = JSON.stringify(request('completionItem/resolve', user).result);
        check(`${target} global docs do not resolve to user warm=${warm}`,
            !globalDoc.includes('USER_BINDING_DOC') && globalDoc.includes('string $string'), globalDoc);
        check(`${target} selected user docs preserve marker warm=${warm}`,
            userDoc.includes('USER_BINDING_DOC'), userDoc);
    }
    await freshEngine();
    const uri = 'file:///release/qualified.php';
    const source = '<?php\nnamespace Vendor { /** VENDOR_DOC */ function chosen(int $value): string {} }\nnamespace Consumer {\nuse function Vendor\\chosen as picked;\nVendor\\chos';
    open(uri, source);
    // The first occurrence is inside the import; the public request must target the call.
    const callPosition = positionAfter(source, 'Vendor\\chos', 1);
    assert.deepEqual(callPosition, { line: 4, character: 11 }, 'qualified fixture call cursor');
    assert.equal(source.split('\n')[callPosition.line], 'Vendor\\chos',
        'the request line is exactly the unfinished call, not the import');
    assert.equal(callPosition.line, source.split('\n').length - 1, 'the call is the final line');
    assert.notDeepEqual(positionAfter(source, 'Vendor\\chos'), callPosition,
        'the repeated import prefix must not become the request cursor');
    const item = completionItems(request('textDocument/completion', {
        textDocument: { uri }, position: callPosition,
    }))
        .find(item => item.data?.m === 'Vendor\\chosen');
    const expected = '<?php\nnamespace Vendor { /** VENDOR_DOC */ function chosen(int $value): string {} }\nnamespace Consumer {\nuse function Vendor\\chosen as picked;\npicked(${1:\\$value})$0';
    check(`${target} qualified prefix and all edits select the imported alias`,
        applyCompletion(source, item) === expected, item);
    check(`${target} qualified alias docs select the indexed FQN`,
        JSON.stringify(request('completionItem/resolve', item).result).includes('VENDOR_DOC'), item);
}

async function releaseMemberAndTypeBoundaries() {
    for (const [tail, symbol, expected] of [
        ['DateTime::RFC3339_EXT', 'RFC3339_EXTENDED', targetAtLeast(7, 0)],
        ["$d=new DateInterval('PT1S');\n$d->f", 'f', targetAtLeast(7, 1)],
    ]) {
        await freshEngine();
        const uri = 'file:///release/member.php';
        const source = `<?php\n${tail}`;
        open(uri, source);
        const items = completionItems(completion(uri, source, tail));
        check(`${target} member ${symbol} own metadata boundary`,
            items.some(item => item.label === symbol || item.filterText === symbol) === expected, items);
    }
    for (const [tail, marker, expected] of [
        ['substr("abc", 0,', 'false', !targetAtLeast(8, 0)],
        ['$d=new DateTime();\n$d->setTime(1,2,3,', 'microsecond', targetAtLeast(7, 1)],
    ]) {
        await freshEngine();
        const uri = 'file:///release/signature.php';
        const source = `<?php\n${tail}`;
        open(uri, source);
        const signature = request('textDocument/signatureHelp', {
            textDocument: { uri }, position: positionAfter(source, tail),
        }).result?.signatures?.[0]?.label;
        check(`${target} signature ${marker} version boundary`,
            typeof signature === 'string' && signature.includes(marker) === expected, signature);
    }
}

initialize();
versionedBuiltinAvailability();
namedArgumentFeature();
strrchrBoundary();
userSymbolsAndBaselineDocs();
await releaseInsertionIdentity();
await releaseFamilyOracle();
await releaseMemberAndTypeBoundaries();
console.log(JSON.stringify({
	target,
	artifactSha256: actualSha,
	buildIdentity,
	assertionsPassed: assertions,
}, null, 2));
