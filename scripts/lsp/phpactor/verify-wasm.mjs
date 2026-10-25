import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPHP } from '../../../src/php-wasm/php.ts';
import * as phpLoader from '../../../src/wasm-assets/php-8.5.js';
import * as dataLoader from '../../../assets/lsp/phpactor/phpactor-loader.js';

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..'
);
const wasmBinary = fs.readFileSync(path.join(repoRoot, 'assets/php-8.5.wasm'));
const phpactorData = fs.readFileSync(
	path.join(repoRoot, 'assets/lsp/phpactor/phpactor.data')
);
const dispatchScript = fs.readFileSync(
	path.join(repoRoot, 'src/lsp/phpactor/dispatch.php'),
	'utf8'
);

let runtimeReady;
let dataLoaded;
const runtimeStart = performance.now();
const runtimeReadyPromise = new Promise((resolve) => (runtimeReady = resolve));
const dataLoadedPromise = new Promise((resolve) => (dataLoaded = resolve));
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
		getPreloadedPackage: () =>
			phpactorData.buffer.slice(
				phpactorData.byteOffset,
				phpactorData.byteOffset + phpactorData.byteLength
			),
		onRuntimeInitialized: () => runtimeReady(),
	},
	[delayedDataModule]
);
await dataLoadedPromise;
console.log(
	`WASM + Phpactor assets ready: ${Math.round(performance.now() - runtimeStart)}ms`
);

php.mkdirTree('/workspace');
php.writeFile('/phpactor-dispatch.php', dispatchScript);
const cachePath =
	'/cache/phpactor/worse-reflection/4f92e1299010be5531c296a1d87761f4.map';
const cacheStatus = php.run({
	code: `echo json_encode([
	'xdg' => getenv('XDG_CACHE_HOME'),
	'stubMap' => is_file('${cachePath}'),
	'phpactorAutoload' => is_file('/phpactor/vendor/autoload.php'),
	'pharLicense' => is_file('/phpactor/LICENSE'),
	'posixExtension' => extension_loaded('posix'),
	'procOpen' => function_exists('proc_open'),
	'pharWrapper' => in_array('phar', stream_get_wrappers(), true),
]);`,
});
console.log(`Runtime cache: ${new TextDecoder().decode(cacheStatus.body)}`);

const cases = [
	{
		operation: 'completion',
		source: "<?php $hello = 'world'; $hel",
		position: 'end',
	},
	{
		operation: 'completion-warm',
		source: "<?php $hello = 'world'; $hel",
		position: 'end',
	},
	{
		operation: 'completion-builtin',
		source: '<?php strl',
		position: 'end',
	},
	{
		operation: 'completion-same-file-function',
		source: '<?php function greetUser(string $name): string { return $name; } gre',
		position: 'end',
	},
	{
		operation: 'completion-same-file-class',
		source: '<?php class Greeter { public function greetUser(): void {} } new Gre',
		position: 'end',
	},
	{
		operation: 'completion-member-instance',
		source: '<?php class Greeter { public function greetUser(): void {} } $greeter = new Greeter(); $greeter->greet',
		position: 'end',
	},
	{
		operation: 'completion-member-static',
		source: '<?php class Greeter { public static function create(): self { return new self(); } } Greeter::cre',
		position: 'end',
	},
	{
		operation: 'signatureHelp',
		source: '<?php strlen(',
		position: 'end',
	},
	{
		operation: 'signatureHelp-local-function',
		source: "<?php function greet(string $name, int $times = 1): string { return $name; } greet('a', ",
		position: 'end',
	},
	{
		operation: 'hover',
		source: "<?php function greet(string $name): string { return $name; } $x = greet('world');",
		position: 'greet-call',
	},
];

for (const testCase of cases) {
	const operation = testCase.operation.startsWith('completion')
		? 'completion'
		: testCase.operation.startsWith('signatureHelp')
			? 'signatureHelp'
			: testCase.operation;
	const jsOffset =
		testCase.position === 'greet-call'
			? testCase.source.indexOf("greet('world')") + 2
			: testCase.source.length;
	const offset = new TextEncoder().encode(
		testCase.source.slice(0, jsOffset)
	).length;
	php.writeFile(
		'/tmp/phpactor-request.json',
		JSON.stringify({
			operation,
			measurement:
				testCase.operation === 'completion-warm'
					? 'warm'
					: testCase.operation === 'completion'
						? 'cold'
						: testCase.operation.startsWith('completion')
							? 'fixture-check'
							: testCase.operation ===
								  'signatureHelp-local-function'
								? 'same-host-limitation-case'
								: 'one-shot',
			phpVersion: '8.2',
			workspaceRoot: '/workspace',
			textDocument: { text: testCase.source },
			offset,
		})
	);
	const started = performance.now();
	const response = php.run({ code: "include '/phpactor-dispatch.php';" });
	const result = JSON.parse(new TextDecoder().decode(response.body));
	console.log(
		JSON.stringify({
			operation: testCase.operation,
			phpRuntime: '8.5',
			analysisPhpVersion: '8.2',
			elapsedMs: Math.round(performance.now() - started),
			result,
			errors: response.errors,
		})
	);
}
