// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createContext, runInContext } from 'node:vm';
import { createServer } from 'node:http';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { installWorkerTrace } from './ui-observation.mjs';
import {
	parseMatrixManifest,
	validateMatrixInputs,
	expectedPhpTargets,
	expectedStrrchrSignature,
} from './ui-contracts.mjs';
import { fetchWithin, runBounded } from './ui-process.mjs';

const helperEvidenceRoot =
	process.env.PHPANTOM_HELPER_EVIDENCE_DIR ??
	resolve(
		import.meta.dirname,
		'../../../build/phpantom-release-helper-evidence'
	);
const targets = [
	'5.6',
	'7.0',
	'7.1',
	'7.2',
	'7.3',
	'7.4',
	'8.0',
	'8.1',
	'8.2',
	'8.3',
	'8.4',
	'8.5',
];
function manifest() {
	return {
		schemaVersion: 1,
		buildIdentity: 'fixture',
		artifacts: Object.fromEntries(targets.map((version) => [version, {}])),
	};
}
describe('UI runner public contracts', () => {
	it.each([false, true])(
		'forwards initialize and response unchanged, prior state=%s',
		async (preexisting) => {
			const sent = [],
				listeners = [];
			class OriginalWorker {
				postMessage(...args) {
					sent.push(args);
					return 31;
				}
				addEventListener(type, listener) {
					if (type === 'message') listeners.push(listener);
				}
			}
			const window = {
				Worker: OriginalWorker,
				...(preexisting
					? { __quality: { protocol: [], marker: 'preserved' } }
					: {}),
			};
			const context = createContext({
				window,
				document: { addEventListener() {} },
				performance: { now: () => 1 },
				Object,
				Proxy,
				Reflect,
			});
			const page = {
				addInitScript: async (callback) =>
					runInContext(`(${callback.toString()})()`, context),
			};
			await installWorkerTrace(page);
			await installWorkerTrace(page);
			const worker = new window.Worker('fixture-worker.js');
			const message = {
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: { initializationOptions: { phpVersion: '8.5' } },
			};
			const transfer = [];
			const got = worker.postMessage(message, transfer);
			const response = {
				jsonrpc: '2.0',
				id: 1,
				result: { capabilities: {} },
			};
			listeners[0]({ data: response });
			expect({
				result: got,
				marker: window.__quality.marker ?? null,
				workerIsOriginal: worker instanceof OriginalWorker,
				sentCount: sent.length,
				sameMessage: sent[0][0] === message,
				sameTransfer: sent[0][1] === transfer,
				protocol: window.__quality.protocol.map((event) => ({
					direction: event.direction,
					message: event.message,
				})),
			}).toEqual({
				result: 31,
				marker: preexisting ? 'preserved' : null,
				workerIsOriginal: true,
				sentCount: 1,
				sameMessage: true,
				sameTransfer: true,
				protocol: [
					{ direction: 'sent', message },
					{ direction: 'received', message: response },
				],
			});
		}
	);
	it('requires the independent complete target set even for a subset', () => {
		const batch = manifest();
		expect({
			targets: expectedPhpTargets,
			rows: validateMatrixInputs(batch, ['8.0', '8.3', '8.5']).map(
				(row) => row.phpVersion
			),
		}).toEqual({ targets, rows: targets });
	});
	it.each([
		'missing',
		'unexpected',
		'compensated-set',
		'duplicate-json-key',
		'empty-selection',
		'unexpected-selection',
		'duplicate-selection',
	])('rejects %s input', (kind) => {
		const batch = manifest();
		let selection = ['8.0', '8.3', '8.5'];
		let raw;
		if (kind === 'missing') delete batch.artifacts['5.6'];
		if (kind === 'unexpected') batch.artifacts['9.9'] = {};
		if (kind === 'compensated-set') {
			delete batch.artifacts['5.6'];
			batch.artifacts['9.9'] = {};
		}
		if (kind === 'empty-selection') selection = [];
		if (kind === 'unexpected-selection') selection = ['9.9'];
		if (kind === 'duplicate-selection') selection = ['8.0', '8.0'];
		raw = JSON.stringify(batch);
		if (kind === 'duplicate-json-key')
			raw = raw.replace('"5.6":{}', '"5.6":{},"5.6":{}');
		expect(() =>
			validateMatrixInputs(parseMatrixManifest(raw), selection)
		).toThrow(Error);
	});
	it.each([
		{
			version: '8.0',
			label: '(string $haystack, string $needle): string|false',
			parameters: ['string $haystack', 'string $needle'],
			activeParameter: 1,
		},
		{
			version: '8.3',
			label: '(string $haystack, string $needle, bool $before_needle = false): string|false',
			parameters: [
				'string $haystack',
				'string $needle',
				'bool $before_needle = false',
			],
			activeParameter: 2,
		},
	])(
		'defines independent ordered strrchr metadata for $version',
		(fixture) => {
			expect(expectedStrrchrSignature(fixture.version)).toEqual({
				functionName: 'strrchr',
				signatures: [
					{ label: fixture.label, parameters: fixture.parameters },
				],
				activeSignature: 0,
				activeParameter: fixture.activeParameter,
			});
		}
	);
	it('bounds an HTTP server that accepts but never responds', async () => {
		const server = createServer(() => {});
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		// Independent cleanup cap also makes a missing production abort fail without hanging this suite.
		const cap = setTimeout(() => server.closeAllConnections(), 500);
		try {
			await expect(
				fetchWithin(`http://127.0.0.1:${server.address().port}`, 30)
			).rejects.toMatchObject({ name: 'TimeoutError' });
		} finally {
			clearTimeout(cap);
			server.closeAllConnections();
			await new Promise((resolve) => server.close(resolve));
		}
	}, 1500);
	it('journals a nonresponding HTTP preflight with actual CLI exit 124', async () => {
		await mkdir(helperEvidenceRoot, { recursive: true });
		const directory = await mkdtemp(join(helperEvidenceRoot, 'http-cli-'));
		const build = join(directory, 'build');
		await mkdir(build);
		await writeFile(join(build, 'index.html'), 'fixture');
		const output = join(directory, 'journal');
		const server = createServer(() => {});
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const cap = setTimeout(() => server.closeAllConnections(), 2500);
		try {
			const actual = await runBounded(
				[
					process.execPath,
					resolve(import.meta.dirname, 'release-ui-test.mjs'),
				],
				{
					cwd: directory,
					env: {
						...process.env,
						PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${server.address().port}`,
						PHPANTOM_RELEASE_FETCH_TIMEOUT_MS: '30',
						PHPANTOM_RELEASE_BUILD: build,
						PHPANTOM_RELEASE_OUT: output,
					},
					timeoutMs: 2000,
				}
			);
			const start = JSON.parse(
				await readFile(join(output, 'START.json'), 'utf8')
			);
			const result = JSON.parse(
				await readFile(join(output, 'result.json'), 'utf8')
			);
			const exit = JSON.parse(
				await readFile(join(output, 'EXIT.json'), 'utf8')
			);
			expect({
				started: typeof start.head === 'string',
				actualExit: actual.exitCode,
				resultExit: result.exitCode,
				journalExit: exit.exitCode,
				passed: exit.passed,
				error: exit.results[0].errorName,
			}).toEqual({
				started: true,
				actualExit: 124,
				resultExit: 124,
				journalExit: 124,
				passed: false,
				error: 'TimeoutError',
			});
		} finally {
			clearTimeout(cap);
			server.closeAllConnections();
			await new Promise((resolve) => server.close(resolve));
		}
	}, 3500);
	it.each([
		{
			name: 'timeout',
			command: [process.execPath, '-e', 'setInterval(()=>{},1000)'],
			timeoutMs: 30,
			want: 124,
			deadline: true,
			stdout: '',
			stderr: '',
		},
		{
			name: 'spawn-error',
			command: ['/nonexistent/phpantom-ui-fixture'],
			timeoutMs: 500,
			want: 127,
			deadline: false,
			stdout: '',
			stderr: '',
		},
		{
			name: 'stdio-close',
			command: [
				process.execPath,
				'-e',
				"process.stdout.write('complete-out');process.stderr.write('complete-err');process.exitCode=7",
			],
			timeoutMs: 1000,
			want: 7,
			deadline: false,
			stdout: 'complete-out',
			stderr: 'complete-err',
		},
	])(
		'records START/result/EXIT and actual numeric exit for $name',
		async (fixture) => {
			await mkdir(helperEvidenceRoot, { recursive: true });
			const directory = await mkdtemp(
				join(helperEvidenceRoot, 'process-')
			);
			const helper = new URL('./ui-process.mjs', import.meta.url).href;
			const script = `import {journalProcess} from ${JSON.stringify(helper)};const r=await journalProcess(${JSON.stringify(directory)},'child',${JSON.stringify(fixture.command)},{timeoutMs:${fixture.timeoutMs}});process.exitCode=r.exitCode;`;
			const actual = await runBounded(
				[process.execPath, '--input-type=module', '-e', script],
				{ timeoutMs: 2000 }
			);
			const start = JSON.parse(
				await readFile(
					join(directory, 'child.process.START.json'),
					'utf8'
				)
			);
			const result = JSON.parse(
				await readFile(
					join(directory, 'child.process.result.json'),
					'utf8'
				)
			);
			const exit = JSON.parse(
				await readFile(
					join(directory, 'child.process.EXIT.json'),
					'utf8'
				)
			);
			expect({
				command: start.command,
				actualExit: actual.exitCode,
				resultExit: result.exitCode,
				journalExit: exit.exitCode,
				deadline: exit.deadlineReached,
				closed: exit.closeObserved,
				stdout: await readFile(
					join(directory, 'child.stdout.log'),
					'utf8'
				),
				stderr: await readFile(
					join(directory, 'child.stderr.log'),
					'utf8'
				),
			}).toEqual({
				command: fixture.command,
				actualExit: fixture.want,
				resultExit: fixture.want,
				journalExit: fixture.want,
				deadline: fixture.deadline,
				closed: true,
				stdout: fixture.stdout,
				stderr: fixture.stderr,
			});
		},
		3000
	);
});
