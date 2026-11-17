import { validateSelectedCompletionPair, decodePositionFixtureRows } from './completion-contract.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const completeKnown = `PHPANTOM_NATIVE_FINISH php74_cold_warm_builtin_and_sibling_resolve failures=0
test php74_cold_warm_builtin_and_sibling_resolve ... ok
PHPANTOM_NATIVE_FINISH php85_cold_warm_builtin_and_sibling_resolve failures=0
test php85_cold_warm_builtin_and_sibling_resolve ... ok
FAIL PHP 7.4 same-name user documentation marker (known baseline): actual="None"
PHPANTOM_NATIVE_FINISH php74_same_name_user_function_and_local_symbols_survive failures=1
thread 'php74_same_name_user_function_and_local_symbols_survive' (123) panicked at tests/native_versioned_embedded.rs:67:5:
PHPANTOM_NATIVE_ASSERTIONS_FAILED: 1 failed native checks: [
    "PHP 7.4 same-name user documentation marker (known baseline): actual=None",
]
test php74_same_name_user_function_and_local_symbols_survive ... FAILED
PHPANTOM_NATIVE_FINISH php74_named_argument_feature_boundary failures=0
test php74_named_argument_feature_boundary ... ok
PHPANTOM_NATIVE_FINISH php85_named_argument_feature_boundary failures=0
test php85_named_argument_feature_boundary ... ok
PHPANTOM_NATIVE_FINISH php80_strrchr_parameter_boundary failures=0
test php80_strrchr_parameter_boundary ... ok
PHPANTOM_NATIVE_FINISH php83_strrchr_parameter_boundary failures=0
test php83_strrchr_parameter_boundary ... ok

failures:
    php74_same_name_user_function_and_local_symbols_survive

test result: FAILED. 6 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.2s
`;
const clean = `PHPANTOM_NATIVE_FINISH php74_cold_warm_builtin_and_sibling_resolve failures=0
test php74_cold_warm_builtin_and_sibling_resolve ... ok
PHPANTOM_NATIVE_FINISH php85_cold_warm_builtin_and_sibling_resolve failures=0
test php85_cold_warm_builtin_and_sibling_resolve ... ok
PHPANTOM_NATIVE_FINISH php74_same_name_user_function_and_local_symbols_survive failures=0
test php74_same_name_user_function_and_local_symbols_survive ... ok
PHPANTOM_NATIVE_FINISH php74_named_argument_feature_boundary failures=0
test php74_named_argument_feature_boundary ... ok
PHPANTOM_NATIVE_FINISH php85_named_argument_feature_boundary failures=0
test php85_named_argument_feature_boundary ... ok
PHPANTOM_NATIVE_FINISH php80_strrchr_parameter_boundary failures=0
test php80_strrchr_parameter_boundary ... ok
PHPANTOM_NATIVE_FINISH php83_strrchr_parameter_boundary failures=0
test php83_strrchr_parameter_boundary ... ok

test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.2s
`;

for (const { name, log, rawExit, want } of [
	{ name: 'complete former baseline failure is rejected', log: completeKnown, rawExit: 101, want: [1, false, false, 1] },
	{ name: 'all seven clean', log: clean, rawExit: 0, want: [0, true, false, 0] },
	{ name: 'known FAIL followed by same-test unwrap panic', log: completeKnown.replace('PHPANTOM_NATIVE_ASSERTIONS_FAILED: 1 failed native checks: [', 'called Result::unwrap() on an Err value'), rawExit: 101, want: [1, false, false, 1] },
	{ name: 'panic before finish sentinel', log: completeKnown.replace('PHPANTOM_NATIVE_FINISH php74_same_name_user_function_and_local_symbols_survive failures=1\n', ''), rawExit: 101, want: [1, false, false, 1] },
	{ name: 'truncated after known FAIL', log: completeKnown.split('PHPANTOM_NATIVE_FINISH php74_same_name')[0], rawExit: 101, want: [1, false, false, 1] },
	{ name: 'truncated missing final summary', log: completeKnown.split('test result:')[0], rawExit: 101, want: [1, false, false, 1] },
	{ name: 'extra failed assertion', log: 'FAIL another public assertion: actual=None\n' + completeKnown, rawExit: 101, want: [1, false, false, 1] },
	{ name: 'zero tests', log: 'test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out;', rawExit: 0, want: [1, false, false, 1] },
	{ name: 'raw exit disagrees with clean log', log: clean, rawExit: 101, want: [1, false, false, 1] },
]) {
	test(`production native classifier: ${name}`, () => {
		const dir = mkdtempSync(path.join(tmpdir(), 'phpantom-native-case-'));
		try {
			writeFileSync(path.join(dir, 'native.log'), log);
			const result = spawnSync('python3', [path.join(moduleDir, 'classify-native.py'), path.join(dir, 'native.log'), String(rawExit), path.join(dir, 'result.json')], { encoding: 'utf8' });
			const output = JSON.parse(readFileSync(path.join(dir, 'result.json'), 'utf8'));
			assert.deepEqual([result.status, output.accepted, output.knownLimitMatched, output.unexpectedFailures], want);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
}

const candidateManifest = {
	schemaVersion: 1, phase: 'B', phpTarget: '8.0', buildIdentity: 'fixture-build',
	artifact: { path: 'phpantom_lsp.wasm', sha256: createHash('sha256').update('fixture-wasm').digest('hex'), bytes: 12 },
	source: { commit: 'fixture-source', appliedPhaseBPatchSha256: 'fixture-patch' },
	stubs: { repository: 'JetBrains/phpstorm-stubs', commit: 'fixture-stubs', resolvedCommitMarker: 'fixture-stubs', archiveSha256: 'archive', lockSha256: 'lock', fullEmbeddedStubs: true, treeSha256: 'tree', mapSha256: 'map', fileCount: 1164 },
	build: { target: 'wasm32-wasip1', command: 'fixture-command', cargoVersion: '1.99', rustcVerbose: '1.99', startedUtc: 'first-attempt' },
	docker: { baseImageRef: 'digest-pin', builderImageId: 'old-image' },
};
for (const { name, mutate, want } of [
	{ name: 'same build allows different attempt timestamps and image instance', mutate: () => {}, want: 0 },
	{ name: 'corrupt artifact', mutate: (dir) => writeFileSync(path.join(dir, 'phpantom_lsp.wasm'), 'broken-bytes'), want: 1 },
	{ name: 'checksum sidecar mismatch', mutate: (dir) => writeFileSync(path.join(dir, 'phpantom_lsp.wasm.sha256'), 'wrong'), want: 1 },
	{ name: 'source pin mismatch', mutate: (dir, m) => { m.source.commit = 'different'; writeFileSync(path.join(dir, 'provenance.json'), JSON.stringify(m)); }, want: 1 },
	{ name: 'stubs pin mismatch', mutate: (dir, m) => { m.stubs.commit = 'different'; writeFileSync(path.join(dir, 'provenance.json'), JSON.stringify(m)); }, want: 1 },
	{ name: 'missing stable provenance field', mutate: (dir, m) => { delete m.build.command; writeFileSync(path.join(dir, 'provenance.json'), JSON.stringify(m)); }, want: 1 },
]) {
	test(`production immutable candidate verifier: ${name}`, () => {
		const root = mkdtempSync(path.join(tmpdir(), 'phpantom-candidate-case-'));
		try {
			for (const dir of ['old', 'new']) {
				mkdirSync(path.join(root, dir));
				writeFileSync(path.join(root, dir, 'phpantom_lsp.wasm'), 'fixture-wasm');
				writeFileSync(path.join(root, dir, 'phpantom_lsp.wasm.sha256'), candidateManifest.artifact.sha256 + '\n');
				writeFileSync(path.join(root, dir, 'provenance.json'), JSON.stringify(candidateManifest));
			}
			const current = structuredClone(candidateManifest);
			current.build.startedUtc = 'new-attempt'; current.docker.builderImageId = 'new-image';
			writeFileSync(path.join(root, 'new', 'provenance.json'), JSON.stringify(current));
			mutate(path.join(root, 'old'), structuredClone(candidateManifest));
			const before = readFileSync(path.join(root, 'old', 'provenance.json'), 'utf8');
			const result = spawnSync('python3', [path.join(moduleDir, 'verify-candidate.py'), path.join(root, 'old'), path.join(root, 'new')], { encoding: 'utf8' });
			assert.deepEqual({ exit: result.status, originalProof: readFileSync(path.join(root, 'old', 'provenance.json'), 'utf8') }, { exit: want, originalProof: before });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
}

const currentPatch = createHash('sha256').update(readFileSync(path.join(moduleDir, 'patches/phase-b-versioned-target.patch'))).digest('hex');
const currentFileManifest = createHash('sha256').update(readFileSync(path.join(moduleDir, 'patches/phase-b-versioned-target.files.json'))).digest('hex');
for (const [field, expectedMessage, current, historical] of [
    ['appliedPhaseBPatchSha256', 'current applied PHPantom patch is required', currentPatch, '4996a41403b2c570ba3e6a5a67c86bbe2833129c95bca62f19c5e39581a4b31d'],
    ['appliedFileManifestSha256', 'current applied file manifest is required', currentFileManifest, 'b15beb40bcac3d50ab75f722c874aba5cb93dcab55aa41aef1e54108c6d35598'],
]) {
    for (const [name, value] of [['missing', undefined], ['historical', historical], ['different', '0'.repeat(64)]]) {
        test(`release WASI provenance rejects ${name} ${field} before opening a binary`, () => {
            const dir = mkdtempSync(path.join(tmpdir(), 'phpantom-release-provenance-'));
            try {
                const source = {
                    commit: '49b9a7513ed19cbbfb79d5d08a3f3693ffb2b668',
                    reviewedPhaseBDiffSha256: 'e12de7944592edf7f38fc8fcf4a5a6065468600329641bd24bb8ae48d4fd260d',
                    reviewedSourceBundleSha256: '60aad10373b97a65da73196aa28e6893a77480a21d5687ad1b140e6d74bd30a3',
                    appliedPhaseBPatchSha256: currentPatch,
                    appliedFileManifestSha256: currentFileManifest,
                };
                assert.equal(source[field], current);
                if (value === undefined) delete source[field]; else source[field] = value;
                const fixture = path.join(dir, 'provenance.json');
                writeFileSync(fixture, JSON.stringify({ phase: 'B', phpTarget: '8.0', source, artifact: {path: 'deliberately-missing.wasm'} }));
                const result = spawnSync(process.execPath, [path.join(moduleDir, 'versioned-wasi-test.mjs'), fixture], { encoding: 'utf8' });
                assert.equal(result.status, 1);
                assert.ok(result.stderr.includes(expectedMessage), result.stderr);
                assert.ok(!result.stderr.includes('ENOENT'), result.stderr);
            } finally {
                rmSync(dir, {recursive: true, force: true});
            }
        });
    }
}


test('selected completion oracle rejects initial/resolved edit-only mutations', () => {
    const source = '<?php namespace App; echo \\TOKEN;';
    const expected = {
        label: 'TOKEN', kind: 21, filterText: 'TOKEN', insertText: '\\TOKEN',
        data: {c: '', m: 'TOKEN', k: 'global_constant', u: 'file:///oracle.php'},
        textEdit: {range: {start: {line: 0, character: 26}, end: {line: 0, character: 32}}, newText: '\\TOKEN'},
        additionalTextEdits: [], document: source,
    };
    const item = structuredClone(expected); delete item.document;
    assert.deepEqual(validateSelectedCompletionPair(source, item, item, expected), {initial: source, resolved: source});
    for (const stage of ['initial', 'resolved']) {
        for (const mutation of ['newText', 'range', 'additional']) {
            const changed = structuredClone(item);
            if (mutation === 'newText') changed.textEdit.newText = 'TOKEN';
            if (mutation === 'range') changed.textEdit.range.end.character -= 1;
            if (mutation === 'additional') changed.additionalTextEdits = [{range: {start: {line: 0, character: 0}, end: {line: 0, character: 0}}, newText: '/* unexpected */'}];
            assert.deepEqual(changed.data, item.data);
            assert.throws(() => validateSelectedCompletionPair(source, stage === 'initial' ? changed : item, stage === 'resolved' ? changed : item, expected), {name: 'AssertionError'});
        }
    }
});

test('builtin function label oracle requires the exact cold or resolve-loaded warm label', () => {
    const source = '<?php \\abs(-7);';
    for (const warm of [false, true]) {
        const expected = {label: warm ? 'abs($num)' : 'abs', kind: 3, filterText: 'abs', insertText: '\\abs',
            data: {c: '', m: 'abs', k: 'function', u: 'file:///label.php'},
            textEdit: {range: {start: {line: 0, character: 6}, end: {line: 0, character: 10}}, newText: '\\abs'}, document: source};
        const item = structuredClone(expected); delete item.document;
        assert.deepEqual(validateSelectedCompletionPair(source, item, item, expected), {initial: source, resolved: source});
        for (const stage of ['initial', 'resolved']) {
            const wrong = structuredClone(item); wrong.label = warm ? 'abs' : 'abs($num)';
            assert.deepEqual(wrong.data, item.data);
            assert.deepEqual(wrong.textEdit, item.textEdit);
            assert.throws(() => validateSelectedCompletionPair(source, stage === 'initial' ? wrong : item, stage === 'resolved' ? wrong : item, expected), {name: 'AssertionError'});
        }
    }
});

for (const [name, source, document] of [
    ['LF', 'A🌟\n猫\nZ\n', 'A🌟\nC\nQ\n'],
    ['CRLF', 'A🌟\r\n猫\r\nZ\r\n', 'A🌟\r\nC\r\nQ\r\n'],
    ['CR', 'A🌟\r猫\rZ\r', 'A🌟\rC\rQ\r'],
    ['mixed', 'A🌟\r\n猫\rZ\n', 'A🌟\r\nC\rQ\n'],
]) {
    test(`completion edit oracle preserves original ${name} UTF-16 coordinates and all edits`, () => {
        const expected = {label: 'Z', kind: 21, filterText: 'Z', insertText: 'Q', data: {c: '', m: 'Z', k: 'global_constant', u: 'file:///coordinates.php'},
            textEdit: {range: {start: {line: 2, character: 0}, end: {line: 2, character: 1}}, newText: 'Q'},
            additionalTextEdits: [{range: {start: {line: 1, character: 0}, end: {line: 1, character: 1}}, newText: 'C'}], document};
        const item = structuredClone(expected); delete item.document;
        assert.deepEqual(validateSelectedCompletionPair(source, item, item, expected), {initial: document, resolved: document});
    });
}

test('completion edit oracle accepts canonical trailing EOF then rejects invalid and overlapping edits', () => {
    const source = 'A🌟\r\n猫\rZ\n';
    const expected = {label: 'Z', kind: 21, filterText: 'Z', insertText: 'END', data: {c: '', m: 'Z', k: 'global_constant', u: 'file:///coordinates.php'},
        textEdit: {range: {start: {line: 3, character: 0}, end: {line: 3, character: 0}}, newText: 'END'}, document: source + 'END'};
    const item = structuredClone(expected); delete item.document;
    assert.deepEqual(validateSelectedCompletionPair(source, item, item, expected), {initial: source + 'END', resolved: source + 'END'});
    for (const position of [{line: -1, character: 0}, {line: 99, character: 0}, {line: 0.5, character: 0}, {line: 0, character: -1}, {line: 0, character: 4}, {line: 0, character: 2}, {line: 3, character: 1}]) {
        const badExpected = structuredClone(expected); badExpected.textEdit.range = {start: position, end: position};
        const badItem = structuredClone(badExpected); delete badItem.document;
        assert.deepEqual(badItem.data, item.data);
        assert.throws(() => validateSelectedCompletionPair(source, badItem, badItem, badExpected), {name: 'AssertionError'});
    }
    const overlapping = structuredClone(expected);
    overlapping.textEdit = {range: {start: {line: 2, character: 0}, end: {line: 2, character: 1}}, newText: 'Q'};
    overlapping.additionalTextEdits = [{range: {start: {line: 2, character: 0}, end: {line: 2, character: 1}}, newText: 'C'}];
    const badItem = structuredClone(overlapping); delete badItem.document;
    assert.throws(() => validateSelectedCompletionPair(source, badItem, badItem, overlapping), {name: 'AssertionError'});
});

test('completion oracle applies an independently supplied default word range on original CR source', () => {
    const source = '<?php\r/*🌟*/ $box->';
    const expected = {label: 'property', kind: 10, filterText: 'property', insertText: 'property',
        data: {c: 'Box', m: 'property', k: 'property', u: 'file:///default.php'},
        fallbackRange: {start: {line: 1, character: 13}, end: {line: 1, character: 13}}, document: source + 'property'};
    const item = {label: 'property', kind: 10, filterText: 'property', insertText: 'property', data: expected.data};
    assert.deepEqual(validateSelectedCompletionPair(source, item, item, expected), {initial: expected.document, resolved: expected.document});
    const explicit = structuredClone(item); explicit.textEdit = {range: expected.fallbackRange, newText: 'property'};
    assert.throws(() => validateSelectedCompletionPair(source, item, explicit, expected), {name: 'AssertionError'});
});

test('completion oracle expands authored default snippet fields and escaped PHP dollars', () => {
    const source = '<?php\r/**\rfunction f(array $items) {}';
    const snippet = '/**\r * @param array<${1:mixed}> \\$items\r */';
    const document = '<?php\r/**\r * @param array<mixed> $items\r */\rfunction f(array $items) {}';
    const expected = {label: '/** PHPDoc Block */', kind: 15, filterText: '/**', insertTextFormat: 2,
        textEdit: {range: {start: {line: 1, character: 0}, end: {line: 1, character: 3}}, newText: snippet}, document};
    const item = structuredClone(expected); delete item.document;
    assert.deepEqual(validateSelectedCompletionPair(source, item, item, expected), {initial: document, resolved: document});
    const wrong = structuredClone(item); wrong.textEdit.newText = snippet.replace('mixed', 'string');
    assert.throws(() => validateSelectedCompletionPair(source, item, wrong, expected), {name: 'AssertionError'});
});

test('completion edit oracle rejects overlapping insertions at the same original position', () => {
    const source = 'A🌟\r\n猫\rZ\n';
    const at = {line: 3, character: 0};
    // These edits are invalid independent of either proposed serial order.
    for (const document of [source + 'ENDX', source + 'XEND']) {
        const expected = {label: 'END', kind: 21, filterText: 'END', insertText: 'END',
            textEdit: {range: {start: at, end: at}, newText: 'END'},
            additionalTextEdits: [{range: {start: at, end: at}, newText: 'X'}], document};
        const item = structuredClone(expected); delete item.document;
        assert.throws(() => validateSelectedCompletionPair(source, item, item, expected), {name: 'AssertionError'});
    }
});

test('bounded default snippet model covers nested, escaped and unsupported forms independently', () => {
    function pair(text, document) {
        const expected = {label: 'snippet', kind: 15, filterText: 'snippet', insertTextFormat: 2,
            textEdit: {range: {start: {line: 0, character: 0}, end: {line: 0, character: 0}}, newText: text}, document};
        const item = structuredClone(expected); delete item.document;
        return validateSelectedCompletionPair('', item, item, expected);
    }
    const document = '猫🌟 $items } \\';
    assert.deepEqual(pair('$0$1${2}${3:猫${4:🌟}} \\$items \\} \\\\', document), {initial: document, resolved: document});
    for (const unsupported of ['${NAME:default}', '$TM_FILENAME', '${1|a,b|}', '${1:unterminated', '${1/regex/replacement/}', '${1:a}$1', '${1:a${1:b}}']) {
        assert.throws(() => pair(unsupported, ''), {name: 'AssertionError'});
    }
});

test('snippet format applies only to primary and additional edits remain literal plaintext', () => {
    const source = '<?php\r/**\rfunction f() {}';
    const expected = {label: 'snippet', kind: 15, filterText: '/**', insertTextFormat: 2,
        textEdit: {range: {start: {line: 1, character: 0}, end: {line: 1, character: 3}}, newText: '/** ${1:doc} */$0'},
        additionalTextEdits: [{range: {start: {line: 0, character: 5}, end: {line: 0, character: 5}}, newText: ' /* $0 ${1:literal} */'}],
        document: '<?php /* $0 ${1:literal} */\r/** doc */\rfunction f() {}'};
    const item = structuredClone(expected); delete item.document;
    assert.deepEqual(validateSelectedCompletionPair(source, item, item, expected), {initial: expected.document, resolved: expected.document});
});

test('Position fixture decoder retains all ordered cells against immutable original matrices', () => {
    const expected = JSON.parse(readFileSync(new URL('./native-probe/tests/fixtures/position-fixture-semantics.json', import.meta.url), 'utf8'));
    assert.deepEqual(Object.keys(expected).sort(), ['generation-attributes.tsv', 'position-consumers-contract-v2.tsv', 'position-consumers-contract.tsv', 'position-consumers.tsv']);
    for (const [name, rows] of Object.entries(expected)) {
        const text = readFileSync(new URL(`./native-probe/tests/fixtures/${name}`, import.meta.url), 'utf8');
        assert.deepEqual(decodePositionFixtureRows(text, rows.length, rows[0].length), rows);
    }
    assert.deepEqual(decodePositionFixtureRows('A\\r\\n\\t\\\\\t\\e\n', 1, 2), [['A\r\n\t\\', '']]);
});
test('Position fixture decoder rejects unknown/truncated escapes, missing cells and blank rows', () => {
    for (const [text, rows, fields] of [['\\q\n', 1, 1], ['\\\n', 1, 1], ['x\n', 1, 2], ['n\ts\t0\t0\tsnippet\tdoc\n', 1, 7], ['n\ts\t0\t0\tsnippet\tdoc\t\\q\n', 1, 7], ['x\t\\e\n\n', 2, 2], ['x', 1, 1], ['x\n', 2, 1]]) {
        assert.throws(() => decodePositionFixtureRows(text, rows, fields));
    }
});

test('constant residual source fixtures keep complete distinct schemas including applicability', () => {
    for (const [name,count,fields] of [['original',17,13],['expanded',85,16],['future',2,15],['negative',8,8],['changes',6,15]]) {
        const text=readFileSync(new URL(`./native-probe/tests/fixtures/constant-residual-${name}.tsv`,import.meta.url),'utf8');
        const rows=decodePositionFixtureRows(text,count,fields);
        assert.equal(new Set(rows.map(row=>row[0])).size,count);
        assert.ok(rows.every(row=>row.every(field=>field.length>0)));
        if(name==='expanded') {
            assert.equal(rows.filter(row=>row[15]==='5.6').length,72);
            assert.equal(rows.filter(row=>row[15]==='7.0').length,13);
        }
    }
});


test('array closer fixtures retain full initial/resolved edit contracts and reject identity-preserving mutants', () => {
    for(const [file,count] of [['array-closer-original.tsv',15],['array-closer-expanded.tsv',158]]){
        const rows=decodePositionFixtureRows(readFileSync(path.join(moduleDir,'native-probe/tests/fixtures',file),'utf8'),count,15);
        assert.equal(new Set(rows.map(f=>f[0])).size,count);
        for(const f of rows){
            const expected={label:f[4],kind:5,filterText:f[4],detail:f[5],textEdit:{range:{start:{line:Number(f[7]),character:Number(f[8])},end:{line:Number(f[9]),character:Number(f[10])}},newText:f[11]},document:f[12]};
            const item={label:f[4],kind:5,filterText:f[4],detail:f[5],textEdit:structuredClone(expected.textEdit)};
            assert.deepEqual(validateSelectedCompletionPair(f[1],item,structuredClone(item),expected),{initial:f[12],resolved:f[12]});
            for(const stage of ['initial','resolved'])for(const field of ['range','text','additional']){
                const pair={initial:structuredClone(item),resolved:structuredClone(item)};
                if(field==='range')pair[stage].textEdit.range.end.character+=1;
                if(field==='text')pair[stage].textEdit.newText+='WRONG';
                if(field==='additional')pair[stage].additionalTextEdits=[{range:{start:{line:0,character:0},end:{line:0,character:0}},newText:'/*WRONG*/'}];
                assert.equal(pair[stage].label,item.label);assert.equal(pair[stage].data,item.data);
                assert.throws(()=>validateSelectedCompletionPair(f[1],pair.initial,pair.resolved,expected),assert.AssertionError);
            }
        }
    }
});


test('multiline key fixtures bind original offsets and both complete payloads including literal EOL bytes',()=>{
    for(const [file,count] of [['multiline-key-original.tsv',6],['multiline-key-expanded.tsv',201],['multiline-key-boundary.tsv',2]]){
        const rows=decodePositionFixtureRows(readFileSync(path.join(moduleDir,'native-probe/tests/fixtures',file),'utf8'),count,15);
        assert.equal(new Set(rows.map(f=>f[0])).size,count);
        for(const f of rows){
            assert.ok(f[13]==='valid'||f[13]==='draft');assert.equal(f[14],f[13]==='valid'?'7':'<draft>');
            const expected={label:f[4],kind:5,detail:f[5],filterText:f[4],textEdit:{range:{start:{line:Number(f[7]),character:Number(f[8])},end:{line:Number(f[9]),character:Number(f[10])}},newText:f[11]},document:f[12]};
            const item={label:f[4],kind:5,detail:f[5],filterText:f[4],textEdit:structuredClone(expected.textEdit)};
            assert.deepEqual(validateSelectedCompletionPair(f[1],item,structuredClone(item),expected),{initial:f[12],resolved:f[12]});
            for(const stage of ['initial','resolved'])for(const field of ['range','text','additional']){
                const pair={initial:structuredClone(item),resolved:structuredClone(item)};
                if(field==='range')pair[stage].textEdit.range.end.character+=1;
                if(field==='text')pair[stage].textEdit.newText+='WRONG';
                if(field==='additional')pair[stage].additionalTextEdits=[{range:{start:{line:0,character:0},end:{line:0,character:0}},newText:'WRONG'}];
                assert.equal(pair[stage].label,item.label);assert.equal(pair[stage].data,item.data);
                assert.throws(()=>validateSelectedCompletionPair(f[1],pair.initial,pair.resolved,expected),assert.AssertionError);
            }
        }
    }
});


test('array producer entry forms share strict full edit oracles without assuming an input quote',()=>{
    for(const [file,count] of [['unquoted-key-original.tsv',1],['unquoted-key-reviewed.tsv',3],['unquoted-key-brace.tsv',2],['unquoted-key-expanded.tsv',249],['unquoted-key-comment.tsv',12]]){
        const rows=decodePositionFixtureRows(readFileSync(path.join(moduleDir,'native-probe/tests/fixtures',file),'utf8'),count,15);assert.equal(new Set(rows.map(f=>f[0])).size,count);
        for(const f of rows){assert.equal(f[13],'valid');assert.equal(f[14],'7');const expected={label:f[4],kind:5,detail:f[5],filterText:f[4],textEdit:{range:{start:{line:Number(f[7]),character:Number(f[8])},end:{line:Number(f[9]),character:Number(f[10])}},newText:f[11]},document:f[12]};const item={label:f[4],kind:5,detail:f[5],filterText:f[4],textEdit:structuredClone(expected.textEdit)};assert.deepEqual(validateSelectedCompletionPair(f[1],item,structuredClone(item),expected),{initial:f[12],resolved:f[12]});for(const stage of['initial','resolved'])for(const field of['range','text','additional']){const pair={initial:structuredClone(item),resolved:structuredClone(item)};if(field==='range')pair[stage].textEdit.range.end.character+=1;if(field==='text')pair[stage].textEdit.newText+='WRONG';if(field==='additional')pair[stage].additionalTextEdits=[{range:{start:{line:0,character:0},end:{line:0,character:0}},newText:'WRONG'}];assert.equal(pair[stage].label,item.label);assert.equal(pair[stage].data,item.data);assert.throws(()=>validateSelectedCompletionPair(f[1],pair.initial,pair.resolved,expected),assert.AssertionError);}}
    }
    const negatives=decodePositionFixtureRows(readFileSync(path.join(moduleDir,'native-probe/tests/fixtures/unquoted-key-negative.tsv'),'utf8'),4,5);assert.equal(new Set(negatives.map(f=>f[0])).size,4);
});
