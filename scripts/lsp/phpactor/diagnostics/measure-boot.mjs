import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { startPHP } from '../../../../src/php-wasm/php.ts';
import * as phpLoader from '../../../../src/wasm-assets/php-8.5.js';
import * as dataLoader from '../../../../assets/lsp/phpactor/phpactor-loader.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative));
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const wasmBinary = read('assets/php-8.5.wasm');
const phpactorData = read('assets/lsp/phpactor/phpactor.data');
const stockDispatch = read('src/lsp/phpactor/dispatch.php').toString('utf8');
const profiledDispatch = read('scripts/lsp/phpactor/diagnostics/dispatch-profile.php').toString('utf8');
const cases = [
	{ name: 'local-variable', text: "<?php $hello = 'world'; $hel" },
	{ name: 'builtin-function', text: '<?php strl' },
	{ name: 'same-file-function', text: '<?php function greetUser(string $name): string { return $name; } gre' },
	{ name: 'same-file-class', text: '<?php class Greeter { public function greetUser(): void {} } new Gre' },
	{ name: 'instance-member', text: '<?php class Greeter { public function greetUser(): void {} } $greeter = new Greeter(); $greeter->greet' },
	{ name: 'static-member', text: '<?php class Greeter { public static function create(): self { return new self(); } } Greeter::cre' },
];

let runtimeReady;
let dataLoaded;
const runtimeReadyPromise = new Promise((resolve) => (runtimeReady = resolve));
const dataLoadedPromise = new Promise((resolve) => (dataLoaded = resolve));
const initStarted = performance.now();
const delayedDataModule = {
	default: async (module) => {
		await runtimeReadyPromise;
		await dataLoader.default(module);
		dataLoaded();
	},
};
const php = await startPHP(
	'8.5',
	phpLoader,
	'WEB',
	{
		wasmBinary,
		ENV: { XDG_CACHE_HOME: '/cache' },
		onRuntimeInitialized: () => runtimeReady(),
		getPreloadedPackage: () => phpactorData.buffer.slice(
			phpactorData.byteOffset,
			phpactorData.byteOffset + phpactorData.byteLength
		),
	},
	[delayedDataModule]
);
await dataLoadedPromise;
const initMs = performance.now() - initStarted;
php.mkdirTree('/workspace');
php.writeFile('/phpactor-dispatch.php', stockDispatch);
php.writeFile('/phpactor-profile.php', profiledDispatch);
php.writeFile('/phpactor-profile-off.php', profiledDispatch.replace('$profile = true;', '$profile = false;'));

const textDecoder = new TextDecoder();
function requestFor(testCase) {
	return {
		operation: 'completion',
		phpVersion: '8.5',
		workspaceRoot: '/workspace',
		textDocument: { text: testCase.text },
		offset: new TextEncoder().encode(testCase.text).length,
	};
}
function execute(script, request) {
	php.writeFile('/tmp/phpactor-request.json', JSON.stringify(request));
	const started = performance.now();
	const response = php.run({ code: `include '${script}';` });
	const elapsedMs = performance.now() - started;
	const body = textDecoder.decode(response.body);
	let parsed;
	try {
		parsed = JSON.parse(body);
	} catch (error) {
		throw new Error(`Non-JSON response from ${script}: ${body}\nstderr: ${response.errors}`, { cause: error });
	}
	return { elapsedMs, body, response, parsed };
}
function median(values) {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// First php.run on this instance includes PHP's one-time Web SAPI setup.
const coldCase = cases[0];
const cold = execute('/phpactor-profile.php', requestFor(coldCase, true));
const coldPhases = cold.parsed.timingsMs;
const coldResult = cold.parsed.result;
const warmSamples = [];
const stockChecks = [];
const observerPairs = [];

for (const testCase of cases) {
	const input = requestFor(testCase);
	const stock = execute('/phpactor-dispatch.php', input);
	const plain = execute('/phpactor-profile-off.php', input);
	stockChecks.push({
		fixture: testCase.name,
		exactBodyMatch: stock.body === plain.body,
		stockExitCode: stock.response.exitCode,
		profileWrapperExitCode: plain.response.exitCode,
		stockResultSummary: Array.isArray(stock.parsed?.items)
			? { itemCount: stock.parsed.items.length, labels: stock.parsed.items.slice(0, 8).map((item) => item.label) }
			: stock.parsed,
	});
	const profile = execute('/phpactor-profile.php', requestFor(testCase));
	warmSamples.push({ fixture: testCase.name, runMs: profile.elapsedMs, phasesMs: profile.parsed.timingsMs });
	for (let i = 0; i < 4; i++) {
		const profileFirst = i % 2 === 0;
		const a = execute(profileFirst ? '/phpactor-profile.php' : '/phpactor-profile-off.php', requestFor(testCase));
		const b = execute(profileFirst ? '/phpactor-profile-off.php' : '/phpactor-profile.php', requestFor(testCase));
		observerPairs.push({ fixture: testCase.name, profileMs: profileFirst ? a.elapsedMs : b.elapsedMs, plainMs: profileFirst ? b.elapsedMs : a.elapsedMs });
	}
}

const overheadByFixture = cases.map(({ name }) => {
	const samples = observerPairs.filter((pair) => pair.fixture === name);
	return {
		fixture: name,
		profileMedianMs: median(samples.map((sample) => sample.profileMs)),
		plainMedianMs: median(samples.map((sample) => sample.plainMs)),
		pairedMedianDeltaMs: median(samples.map((sample) => sample.profileMs - sample.plainMs)),
	};
});
const result = {
	measurement: 'Node-hosted WASM harness; not browser/UI timing',
	phpRuntime: '8.5',
	analysisPhpVersion: '8.5',
	phpactorVersion: '2026.10.07.0',
	assets: {
		wasm: { path: 'assets/php-8.5.wasm', bytes: wasmBinary.byteLength, sha256: sha256(wasmBinary) },
		phpactorData: { path: 'assets/lsp/phpactor/phpactor.data', bytes: phpactorData.byteLength, sha256: sha256(phpactorData) },
		phpactorPharSha256: 'b28bf6166e016d539fc2f2aec18ef918b12590e436a6f1ccbdf30b5bbdbdb16b',
	},
	conditions: {
		runtimeMode: 'startPHP(..., WEB) running under Node; same Emscripten/WASM php.run API as adapter',
		workspaceRoot: '/workspace',
		cache: '/cache/phpactor/... preloaded data cache is retained between runs',
		coldDefinition: 'first php.run on this initialized PHP object, includes one-time #initWebRuntime plus first dispatch',
		warmDefinition: 'subsequent php.run on same PHP object; PHP request shutdown occurs after every run',
		phpClock: 'hrtime(true), durations within PHP only',
		jsClock: 'performance.now(), durations around php.run only; never subtracted from PHP hrtime',
		observer: 'profile wrapper vs same wrapper without timers/diagnostic envelope; 4 alternating pairs per fixture; paired median delta is approximate observer overhead',
	},
	counts: { coldRuns: 1, warmProfileRuns: warmSamples.length, observerPairs: observerPairs.length, stockEquivalenceCases: stockChecks.length, totalPhpRuns: 67 },
	initMs,
	cold: { fixture: coldCase.name, runMs: cold.elapsedMs, phpPhasesMs: coldPhases, resultSummary: { itemCount: coldResult.items?.length ?? null, firstLabels: coldResult.items?.slice(0, 8).map((item) => item.label) } },
	warmProfileSamples: warmSamples,
	warmProfileRunMedianMs: median(warmSamples.map((sample) => sample.runMs)),
	observerOverhead: overheadByFixture,
	stockEquivalence: stockChecks,
};
console.log(JSON.stringify(result, null, 2));
