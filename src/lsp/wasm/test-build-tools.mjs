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
