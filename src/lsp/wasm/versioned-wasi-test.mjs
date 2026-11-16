import {validateVariableAliasPair} from './completion-contract.mjs';
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
assert.equal(manifest.source?.appliedPhaseBPatchSha256,
    'c0326a26b6ae764776004367df665f4d977a9f6f134bfbcd9392a8eaeb2701a0',
    'current applied PHPantom patch is required before WASM instantiation');
assert.equal(manifest.source?.appliedFileManifestSha256,
    'f991d183af4f57899e507fab93bf67cd622cc9212d17c98e5803aac9b1c588d0',
    'current applied file manifest is required before WASM instantiation');
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
    const allRows=(await readFile(new URL('./native-probe/tests/fixtures/minimum-availability.tsv',import.meta.url),'utf8')).split('\n')
        .filter(line=>line && !line.startsWith('#')).map(line=>line.split('\t'));
    const symbols=[['class','Attribute'],['class','Fiber'],['class','Random\\Randomizer'],['constant','JSON_THROW_ON_ERROR'],['constant','PHP_FLOAT_EPSILON'],['function','array_is_list'],['function','intdiv'],['function','random_bytes'],['function','str_ends_with'],['interface','Throwable'],['member','DateTime::createFromImmutable'],['removed','create_function'],['removed','each'],['removed','get_magic_quotes_gpc']];
    assert.equal(allRows.length,168,'the independent oracle is exactly 14 symbols by 12 targets');
    assert.ok(allRows.every(row=>row.length===6 && ['true','false'].includes(row[3])));
    assert.deepEqual(allRows.map(row=>row.slice(0,3).join(':')).sort(),supportedTargets.flatMap(version=>symbols.map(([family,symbol])=>[version,family,symbol].join(':'))).sort());
    const rows=allRows.filter(row=>row[0]===target);
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

async function releaseLanguageOracle() {
    const rows=(await readFile(new URL('./native-probe/tests/fixtures/language-completion.tsv',import.meta.url),'utf8'))
        .split('\n').filter(row=>row&&!row.startsWith('#')).map(row=>row.split('\t'));
    assert.equal(rows.length,148,'the complete independent language/context inventory is required');
    assert.equal(new Set(rows.map(row=>row[0])).size,148,'language case IDs must be unique');
    const targetIndex=supportedTargets.indexOf(target);
    for (const [name,label,category,encodedSource,expectedTargets] of rows) {
        assert.match(expectedTargets,/^[01]{12}$/,'every supported PHP target has an explicit expectation');
        await freshEngine();
        const uri='file:///release/language.php';
        const source=encodedSource.replaceAll('\\n','\n');
        open(uri,source);
        const lines=source.split('\n');
        const position={line:lines.length-1,character:lines.at(-1).length};
        // Fixtures request the end of the document, never a first substring occurrence.
        const items=completionItems(request('textDocument/completion',{textDocument:{uri},position}));
        const kind=category==='function'||category==='any-function'?3:category==='class'?7:14;
        const actual=items.some(item=>item.kind===kind && (category!=='type'||item.detail==='PHP built-in type')
            && (category==='any-function' || item.filterText===label || item.label===label));
        check(`${target} language ${name}`,actual===(expectedTargets[targetIndex]==='1'),{position,expected:expectedTargets[targetIndex],items});
    }
}

async function releaseImportOracle() {
    const rows=(await readFile(new URL('./native-probe/tests/fixtures/import-completion.tsv',import.meta.url),'utf8'))
        .split('\n').filter(row=>row&&!row.startsWith('#')).map(row=>row.split('\t'));
    assert.equal(rows.length,21,'complete independent import inventory');
    assert.equal(new Set(rows.map(row=>row[0])).size,21,'unique import case IDs');
    for (const [name,encodedSource,symbol,kind,forbidden] of rows) {
        await freshEngine();
        const uri='file:///release/import.php';
        const source=encodedSource.replaceAll('\\n','\n');
        open(uri,source);
        const lines=source.split('\n');
        const position={line:lines.length-1,character:lines.at(-1).length};
        const items=completionItems(request('textDocument/completion',{textDocument:{uri},position}));
        const expectedKind=Number(kind);
        const found=items.some(item=>item.kind===expectedKind &&
            (item.label===symbol||item.filterText===symbol||item.data?.m===symbol));
        check(`${target} import ${name}`,found&&items.every(item=>item.kind===expectedKind && (forbidden==='-' || !(item.label===forbidden||item.filterText===forbidden||item.data?.m===forbidden))),{position,symbol,expectedKind,items});
    }
}

function importEditPayload(item) {
    return { primary:item.textEdit??null, insertText:item.insertText??null,
        format:item.insertTextFormat??null, mode:item.insertTextMode??null,
        textEditText:item.textEditText??null, additional:item.additionalTextEdits??null, command:item.command??null };
}
async function releaseImportEditOracle() {
    const rows=(await readFile(new URL('./native-probe/tests/fixtures/import-edits.tsv',import.meta.url),'utf8'))
        .split('\n').filter(row=>row&&!row.startsWith('#')).map(row=>row.split('\t').map(value=>value.replaceAll('\\n','\n')));
    assert.equal(rows.length,27,'complete independent accepted-edit inventory');
    assert.equal(new Set(rows.map(row=>row[0])).size,27,'unique edit case IDs');
    const endPosition=text=>{const lines=text.split('\n');return {line:lines.length-1,character:lines.at(-1).length};};
    for (const [name,before,typed,after,newText,expectedDocument,fqn,kind,,availability] of rows) {
        await freshEngine();
        const uri='file:///release/import-edits.php';
        const source=before+typed+after;const position=endPosition(before+typed);
        open(uri,source);
        for (const warm of [false,true]) {
            const items=completionItems(request('textDocument/completion',{textDocument:{uri},position}));
            assert.match(availability,/^[01]{12}$/,'each target has an explicit independent availability');
            if (availability[supportedTargets.indexOf(target)]==='0') {
                check(`${target} group imports unavailable ${name} warm=${warm}`,items.length===0,items);
                continue;
            }
            const item=items.find(value=>value.kind===Number(kind)&&value.data?.m===fqn);
            assert.ok(item,`${target} ${name} requires ${fqn}: ${JSON.stringify(items)}`);
            const end={...position};if(name==='cursor-middle')end.character+=3;
            const expected={primary:{range:{start:endPosition(before),end},newText},insertText:newText,
                format:1,mode:null,textEditText:null,additional:null,command:null};
            assert.deepEqual(importEditPayload(item),expected,`${name} complete primary/additional payload`);
            const applied=applyCompletion(source,item);
            assert.equal(applied,expectedDocument,`${name} complete accepted document`);
            const resolved=request('completionItem/resolve',item).result;
            assert.deepEqual(importEditPayload(resolved),expected,`${name} resolve preserves editing payload`);
            assert.equal(applyCompletion(source,resolved),expectedDocument,`${name} resolved accepted document`);
            check(`${target} import edit ${name} warm=${warm}`,items.every(value=>value.kind===Number(kind)),items);
            console.log(`IMPORT_EDIT_RESPONSE ${JSON.stringify({target,name,warm,source,position,item,resolved,applied,expectedDocument})}`);
        }
    }
}

async function releaseImportRenameOracle() {
    await freshEngine();
    const uri='file:///release/import-renamed.php';
    const first='<?php namespace Vendor { /** OLD_IMPORT_DOC */ function old_name(): string { return "old"; } } namespace App { use function Vendor\\{old_na';
    open(uri,first);
    const endPosition=text=>{const lines=text.split('\n');return {line:lines.length-1,character:lines.at(-1).length};};
    const old=completionItems(request('textDocument/completion',{textDocument:{uri},position:endPosition(first)}))
        .find(item=>item.data?.m==='Vendor\\old_name');
    if (target==='5.6') { check(`${target} renamed group import unavailable`,old===undefined,old); return; }
    assert.ok(old,'old group function is publicly offered');
    const oldDocs=request('completionItem/resolve',old).result.documentation?.value;
    check(`${target} old group function warmed`,oldDocs?.includes('OLD_IMPORT_DOC'),oldDocs);
    for (const [version,before,typed,after,symbol,marker,value] of [
        [2,'<?php namespace Vendor { /** FIRST_IMPORT_DOC */ function new_name(): string { return "first"; } } namespace App { use function Vendor\\{','new_na','}; echo new_name(); }','new_name','FIRST_IMPORT_DOC','first'],
        [3,'<?php namespace Vendor { /** SECOND_IMPORT_DOC */ function latest_name(): string { return "second"; } } namespace App { use Vendor\\{function ','latest_na','}; echo latest_name(); }','latest_name','SECOND_IMPORT_DOC','second'],
    ]) {
        const source=before+typed+after;
        notify('textDocument/didChange',{textDocument:{uri,version},contentChanges:[{text:source}]});
        const position=endPosition(before+typed);
        const items=completionItems(request('textDocument/completion',{textDocument:{uri},position}));
        const item=items.find(value=>value.data?.m===`Vendor\\${symbol}`);
        assert.ok(item,`${symbol} is available immediately after didChange`);
        const expected={primary:{range:{start:endPosition(before),end:position},newText:symbol},insertText:symbol,
            format:1,mode:null,textEditText:null,additional:null,command:null};
        assert.deepEqual(importEditPayload(item),expected,'edited group keeps the complete binding edit');
        const resolved=request('completionItem/resolve',item).result;
        assert.deepEqual(importEditPayload(resolved),expected,'resolve keeps the edited group binding');
        const docs=resolved.documentation?.value;
        const applied=applyCompletion(source,resolved);const expectedDocument=before+symbol+after;
        assert.equal(applied,expectedDocument);
        check(`${target} renamed group function ${symbol}`,docs?.includes(marker)&&!docs.includes('OLD_IMPORT_DOC'),docs);
        console.log(`IMPORT_RENAME_RESPONSE ${JSON.stringify({target,symbol,source,item,resolved,applied,expectedDocument,expectedPhpStdout:value})}`);
    }
}

async function releaseAttributeDocOracle() {
    // These declarations are valid PHP8 attribute syntax; earlier targets keep
    // their existing baseline/user-PHPDoc tests without claiming PHP8 syntax.
    if (!targetAtLeast(8,0)) return;
    const rows=(await readFile(new URL('./native-probe/tests/fixtures/attribute-docs.tsv',import.meta.url),'utf8'))
        .split('\n').filter(row=>row&&!row.startsWith('#')).map(row=>row.split('\t').map(value=>value.replaceAll('\\n','\n')));
    assert.equal(rows.length,17,'complete independent attribute-doc inventory');
    assert.equal(new Set(rows.map(row=>row[4])).size,17,'unique required markers');
    for (const [source,member,className,kind,marker,rejected] of rows) {
        await freshEngine();const uri='file:///release/attribute-docs.php';open(uri,source);
        const lines=source.split('\n');const position={line:lines.length-1,character:lines.at(-1).length};
        for (const warm of [false,true]) {
            const items=completionItems(request('textDocument/completion',{textDocument:{uri},position}));
            const item=items.find(value=>value.kind===Number(kind)&&value.data?.m===member&&(!className||value.data?.c===className));
            assert.ok(item,`${target} ${marker} selected FQN ${className}::${member}`);
            const resolved=request('completionItem/resolve',item).result;
            const docs=resolved.documentation?.value??resolved.documentation??'';
            check(`${target} attribute PHPDoc ${marker} warm=${warm}`,typeof docs==='string'&&docs.includes(marker)&&!docs.includes(rejected),{item,resolved});
            console.log(`ATTRIBUTE_DOC_RESPONSE ${JSON.stringify({target,marker,warm,source,item,resolved})}`);
        }
    }
}

async function releaseOpaqueAttributeDocOracle() {
    if (!targetAtLeast(8,0)) return;
    const rows=(await readFile(new URL('./native-probe/tests/fixtures/attribute-opaque-docs.tsv',import.meta.url),'utf8'))
        .split('\n').filter(Boolean).map(row=>row.split('\t').map(value=>value.replaceAll('\\n','\n').replaceAll('\\r','\r')));
    assert.equal(rows.length,84,'complete opaque attribute inventory');
    assert.equal(new Set(rows.map(row=>row[6])).size,84,'unique opaque attribute cases');
    for (const [declaration,source,member,owner,kind,marker,name] of rows) {
        await freshEngine(); open('file:///release/declaration.php',declaration);
        const uri='file:///release/consumer.php';open(uri,source);
        const lines=source.split('\n');const position={line:lines.length-1,character:lines.at(-1).length};
        for (const warm of [false,true]) {
            const items=completionItems(request('textDocument/completion',{textDocument:{uri},position}));
            const item=items.find(value=>value.kind===Number(kind)&&value.data?.m===member&&(!owner||value.data?.c===owner));
            assert.ok(item,`${target} ${name} selected FQN ${owner}::${member}`);
            const resolved=request('completionItem/resolve',item).result;
            const docs=resolved.documentation?.value??resolved.documentation??'';
            const valid=typeof docs==='string'&&(marker?docs.includes(marker):!docs.includes('OWN_DOC_'))&&!['FAKE_ARGUMENT','FAKE_BODY','NEIGHBOR_DOC','OTHER_DOC'].some(value=>docs.includes(value));
            check(`${target} opaque attribute PHPDoc ${name} warm=${warm}`,valid,{item,resolved});
            console.log(`ATTRIBUTE_OPAQUE_DOC_RESPONSE ${JSON.stringify({target,name,warm,declaration,source,position,item,resolved})}`);
        }
    }
}

async function releaseDocumentStringCompletionOracle() {
    if (!targetAtLeast(8,0)) return;
    const rows=(await readFile(new URL('./native-probe/tests/fixtures/document-string-completion.tsv',import.meta.url),'utf8'))
        .split('\n').filter(Boolean).map(row=>row.split('\t').map(value=>value.replaceAll('\\n','\n').replaceAll('\\r','\r')));
    assert.equal(rows.length,42,'complete document-string completion inventory');
    assert.equal(new Set(rows.map(row=>row[8])).size,42,'unique document-string cases');
    assert.equal(rows.filter(row=>row[7]==='0').length,9,'opaque body negative controls');
    for (const [source,member,owner,kind,marker,line,character,present,name] of rows) {
        await freshEngine();const uri='file:///release/samefile.php';open(uri,source);
        const position={line:Number(line),character:Number(character)};
        for (const warm of [false,true]) {
            const response=request('textDocument/completion',{textDocument:{uri},position});
            const items=completionItems(response);
            const item=items.find(value=>value.kind===Number(kind)&&value.data?.m===member&&(!owner||value.data?.c===owner));
            let resolved;
            if (present==='1') {
                assert.ok(item,`${target} ${name} selected FQN ${owner}::${member}`);
                resolved=request('completionItem/resolve',item).result;
                const docs=resolved.documentation?.value??resolved.documentation??'';
                check(`${target} document-string completion ${name} warm=${warm}`,typeof docs==='string'&&docs.includes(marker),{item,resolved});
            } else {
                check(`${target} opaque body completion ${name} warm=${warm}`,items.length===0,{response});
            }
            console.log(`DOCUMENT_STRING_COMPLETION_RESPONSE ${JSON.stringify({target,name,warm,source,position,response,item,resolved})}`);
        }
    }
}

async function releaseVariableAliasOracle() {
    const rows=(await readFile(new URL('./native-probe/tests/fixtures/variable-alias.tsv',import.meta.url),'utf8'))
        .split('\n').filter(Boolean).map(row=>row.split('\t').map(value=>value.replaceAll('\\n','\n').replaceAll('\\r','\r')));
    assert.equal(rows.length,36,'complete variable/alias inventory');
    assert.equal(new Set(rows.map(row=>row[0])).size,36,'unique variable/alias cases');
    assert.deepEqual(rows.filter(row=>row[0].startsWith('alias-version-')).map(row=>row[13]),['5.6','7.0','7.1','7.2','7.3','7.4','8.0','8.1','8.2','8.3','8.4','8.5'],'independent exact target decisions');
    const selected=rows.filter(row=>row[0].startsWith('alias-version-')?row[13]===target:row[7]==='6'||targetAtLeast(8,0));
    assert.equal(selected.length,targetAtLeast(8,0)?25:13);
    for (const [name,initial,source,line,character,label,identity,kind,start,end,text,wantDoc,, ,present] of selected) {
        await freshEngine();const uri='inmemory://model/1';open(uri,initial);
        notify('textDocument/didChange',{textDocument:{uri,version:2},contentChanges:[{text:source}]});
        const position={line:Number(line),character:Number(character)};
        for (const warm of [false,true]) {
            const response=request('textDocument/completion',{textDocument:{uri},position});
            const items=completionItems(response);const item=items.find(value=>value.label===label&&value.kind===Number(kind)&&(kind==='6'||value.data?.m===identity));
            let resolved,accepted;
            if (present==='0') {
                check(`${target} variable/alias negative ${name} warm=${warm}`,item===undefined,{response});
            } else {
                assert.ok(item,`${target} ${name} selected ${identity}`);
                resolved=request('completionItem/resolve',item).result;
                const expected={label,identity,kind:Number(kind),text,range:{start:{line:Number(line),character:Number(start)},end:{line:Number(line),character:Number(end)}},filter:text.startsWith('\\')?text:label,format:text.includes('$0')?2:undefined,document:wantDoc};
                const documents=validateVariableAliasPair(source,item,resolved,expected);
                accepted=documents.initial;
                check(`${target} variable/alias original+resolved ${name} warm=${warm}`,documents.initial===wantDoc&&documents.resolved===wantDoc,{item,resolved,documents});
                if(name==='attribute-alias-ASCII-control'&&!warm){
                    const original=JSON.stringify(item);
                    for(const mutation of ['newText','range','additional']){
                        const mutant=JSON.parse(JSON.stringify(resolved));
                        if(mutation==='newText')mutant.textEdit.newText='Wrong';
                        if(mutation==='range')mutant.textEdit.range.end.character-=1;
                        if(mutation==='additional')mutant.additionalTextEdits=[{range:{start:{line:0,character:0},end:{line:0,character:0}},newText:'/* unexpected */'}];
                        assert.deepEqual(mutant.data,resolved.data,'selected identity unchanged');
                        assert.equal(JSON.stringify(item),original,'initial payload unchanged');
                        assert.throws(()=>validateVariableAliasPair(source,item,mutant,expected),{name:'AssertionError'});
                        check(`${target} resolved-only ${mutation} mutation rejected`,true);
                    }
                }
            }
            console.log(`VARIABLE_ALIAS_RESPONSE ${JSON.stringify({target,name,warm,source,position,response,item,resolved,accepted})}`);
        }
    }
}

async function releaseBoundaryInterpolationOracle() {
    if(!targetAtLeast(8,0))return;
    const rows=(await readFile(new URL('./native-probe/tests/fixtures/boundary-interpolation.tsv',import.meta.url),'utf8')).split('\n').filter(Boolean).map(row=>row.split('\t').map(value=>value.replaceAll('\\n','\n').replaceAll('\\r','\r').replaceAll('\\t','\t')));
    assert.equal(rows.length,36,'complete independent boundary/interpolation table');
    assert.equal(new Set(rows.map(row=>row[8])).size,36,'unique boundary/interpolation cases');
    for(const [source,member,owner,kind,marker,line,character,present,name] of rows){
        await freshEngine();const uri='file:///independent.php';open(uri,source);const position={line:Number(line),character:Number(character)};
        for(const warm of [false,true]){
            const response=request('textDocument/completion',{textDocument:{uri},position});const items=completionItems(response);
            const item=items.find(value=>value.kind===Number(kind)&&value.data?.m===member&&(!owner||value.data?.c===owner));let resolved;
            if(present==='0')check(`${target} literal boundary ${name} warm=${warm}`,items.length===0,{response});
            else{
                assert.ok(item,`${target} ${name} selected ${owner}::${member}`);resolved=request('completionItem/resolve',item).result;
                const doc=resolved.documentation?.value??resolved.documentation??'';
                for(const key of ['c','m','k'])assert.equal(resolved.data?.[key],item.data?.[key],`${name} resolved identity ${key}`);
                for(const key of ['textEdit','additionalTextEdits','insertText','insertTextFormat','insertTextMode','textEditText','command'])assert.deepEqual(resolved[key],item[key],`${name} resolved full edit field ${key}`);
                check(`${target} boundary/interpolation ${name} warm=${warm}`,typeof doc==='string'&&doc.includes(marker),{item,resolved});
            }
            console.log(`BOUNDARY_INTERPOLATION_RESPONSE ${JSON.stringify({target,name,warm,source,position,response,item,resolved})}`);
        }
    }
    const consumers=(await readFile(new URL('./native-probe/tests/fixtures/boundary-doc-consumer.tsv',import.meta.url),'utf8')).split('\n').filter(Boolean).map(row=>row.split('\t').map(value=>value.replaceAll('\\n','\n').replaceAll('\\r','\r').replaceAll('\\t','\t')));
    assert.equal(consumers.length,2,'LF/CR separate consumer controls');
    for(const [name,declaration,source,marker] of consumers){
        await freshEngine();open('file:///declaration.php',declaration);const uri='file:///consumer.php';open(uri,source);
        for(const warm of [false,true]){
            const items=completionItems(request('textDocument/completion',{textDocument:{uri},position:{line:1,character:3}}));const item=items.find(value=>value.kind===7&&value.data?.m==='Target');assert.ok(item,`${name} separate consumer Target`);const resolved=request('completionItem/resolve',item).result;
            assert.equal(resolved.data?.m,'Target');for(const key of ['textEdit','additionalTextEdits','insertText','insertTextFormat','insertTextMode','textEditText','command'])assert.deepEqual(resolved[key],item[key],`${name} consumer edit field ${key}`);
            const docs=resolved.documentation?.value??resolved.documentation??'';check(`${target} separate consumer ${name} warm=${warm}`,typeof docs==='string'&&docs.includes(marker),{item,resolved});
            console.log(`SEPARATE_BOUNDARY_DOC_RESPONSE ${JSON.stringify({target,name,warm,declaration,source,item,resolved})}`);
        }
    }

}

async function releaseSharedConstantDeclarations() {
    for (const symbol of ['PHP_SBINDIR','PHP_OUTPUT_HANDLER_PROCESSED']) {
        await freshEngine();
        const uri='file:///release/shared-constant.php';
        const source=`<?php\n${symbol.slice(0,-1)}`;
        open(uri,source);
        const get=()=>completionItems(request('textDocument/completion',{textDocument:{uri},position:{line:1,character:symbol.length-1}}));
        const offered=items=>items.some(item=>item.filterText===symbol || item.label===symbol || item.data?.m===symbol);
        const expected=targetAtLeast(8,4);
        check(`${target} shared declaration ${symbol} cold`,offered(get())===expected,{expected});
        const siblingUri='file:///release/shared-constant-warm.php';
        const siblingSource='<?php\nPHP_O';open(siblingUri,siblingSource);
        const sibling=completionItems(completion(siblingUri,siblingSource,'PHP_O')).find(item=>item.data?.m==='PHP_OS');
        assert.ok(sibling,'the same Core_d source is warmed through public resolve');
        request('completionItem/resolve',sibling);
        check(`${target} shared declaration ${symbol} warm`,offered(get())===expected,{expected});
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
await releaseSharedConstantDeclarations();
await releaseLanguageOracle();
await releaseImportOracle();
await releaseImportEditOracle();
await releaseImportRenameOracle();
await releaseAttributeDocOracle();
await releaseOpaqueAttributeDocOracle();
await releaseDocumentStringCompletionOracle();
await releaseVariableAliasOracle();
await releaseBoundaryInterpolationOracle();
console.log(JSON.stringify({
	target,
	artifactSha256: actualSha,
	buildIdentity,
	assertionsPassed: assertions,
}, null, 2));
