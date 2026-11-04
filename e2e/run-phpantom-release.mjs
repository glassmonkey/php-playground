// Required semantic checks against a production build. No automatic retries.
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, chmod } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import process from 'node:process';
import { fetchWithin, journalProcess } from './phpantom-process.mjs';

const root = resolve(import.meta.dirname, '..');
const directory = resolve(
	process.env.PHPANTOM_RELEASE_OUT ?? 'build/phpantom-release-evidence'
);
const build = resolve(process.env.PHPANTOM_RELEASE_BUILD ?? 'public');
const phase = process.env.PHPANTOM_RELEASE_PHASE ?? 'all';
if (!['all', 'matrix', 'review', 'semantics'].includes(phase))
	throw new Error('Unknown release phase');
const fetchBudgetMs = Math.min(
	10_000,
	Number(process.env.PHPANTOM_RELEASE_FETCH_TIMEOUT_MS ?? 10_000)
);
if (!Number.isFinite(fetchBudgetMs) || fetchBudgetMs <= 0)
	throw new Error('Invalid fetch budget');
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4176';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (...args) =>
	execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
await mkdir(directory, { recursive: true });
async function inventory(path) {
	const rows = [];
	for (const entry of await readdir(path, { withFileTypes: true })) {
		const file = join(path, entry.name);
		if (entry.isDirectory()) rows.push(...(await inventory(file)));
		else
			rows.push({
				path: relative(root, file),
				bytes: (await readFile(file)).byteLength,
				sha256: digest(await readFile(file)),
			});
	}
	return rows.sort((a, b) => a.path.localeCompare(b.path));
}
const sources = [
	'src/lsp/client.ts',
	'src/lsp/wasm/versioned-ui-test.mjs',
	'src/lsp/wasm/review-ui-test.mjs',
	'e2e/phpantom-observation.mjs',
	'e2e/phpantom-contracts.mjs',
	'e2e/phpantom-process.mjs',
	'e2e/run-phpantom-release.mjs',
	'assets/lsp/phpantom/manifest.json',
	'.github/workflows/playwright.yml',
];
const head = git('rev-parse', 'HEAD');
const start = {
	startedAt: new Date().toISOString(),
	head,
	workflowSHA: process.env.GITHUB_SHA ?? null,
	pullRequestHead: process.env.PHPANTOM_SOURCE_HEAD ?? null,
	phase,
	baseURL,
	build,
	sources: Object.fromEntries(
		await Promise.all(
			sources.map(async (path) => [
				path,
				digest(await readFile(resolve(root, path))),
			])
		)
	),
	diffSha256: digest(git('diff', '--binary')),
	buildFiles: await inventory(build),
	automaticRetries: 0,
	deadlineSeconds: 420,
};
const save = async (name, value) => {
	const path = join(directory, name);
	await writeFile(path, JSON.stringify(value, null, 2) + '\n', {
		flag: 'wx',
	});
	await chmod(path, 0o444);
};
await save('START.json', start);
let server;
const overall = new AbortController();
let globalExpired = false;
let serverClosed;
let serverCloseObserved = false;
let serverSpawnError;
const serverLogs = [];
function terminateOwned(child) {
	if (!child?.pid || serverCloseObserved) return;
	try {
		process.kill(-child.pid, 'SIGTERM');
	} catch (error) {
		if (error.code !== 'ESRCH') throw error;
	}
	const timer = setTimeout(() => {
		try {
			process.kill(-child.pid, 'SIGKILL');
		} catch (error) {
			if (error.code !== 'ESRCH') throw error;
		}
	}, 5_000);
	child.once('close', () => clearTimeout(timer));
}
const results = [];
const deadline = setTimeout(() => {
	globalExpired = true;
	overall.abort(
		new DOMException('Global semantic deadline reached', 'TimeoutError')
	);
	terminateOwned(server);
	process.exitCode = 124;
}, 420_000);
async function run(name, args, env, expected) {
	if (globalExpired) throw new Error('Global semantic deadline reached');
	const output = join(directory, `${name}.result.json`);
	const command = [process.execPath, ...args];
	const record = {
		name,
		command,
		environment: env,
		expected,
		startedAt: new Date().toISOString(),
	};
	await save(`${name}.START.json`, record);
	const processResult = await journalProcess(directory, name, command, {
		cwd: root,
		env: {
			...process.env,
			...env,
			PLAYWRIGHT_BASE_URL: baseURL,
			PHPANTOM_MATRIX_OUT: output,
			PHPANTOM_REVIEW_OUT: output,
		},
		timeoutMs: 180_000,
		signal: overall.signal,
	});
	const { exitCode, deadlineReached: expired } = processResult;
	let result;
	try {
		result = JSON.parse(await readFile(output, 'utf8'));
	} catch (error) {
		result = { missingResult: String(error) };
	}
	const summary = result.summary;
	const passed =
		exitCode === 0 &&
		!expired &&
		summary?.passed === expected &&
		summary?.failed === 0 &&
		(!('invalidFixture' in summary) || summary.invalidFixture === 0);
	const terminal = {
		...record,
		finishedAt: new Date().toISOString(),
		exitCode,
		deadlineReached: expired,
		summary,
		passed,
		resultSha256: await readFile(output)
			.then(digest)
			.catch(() => null),
	};
	await save(`${name}.EXIT.json`, terminal);
	results.push(terminal);
	console.log(JSON.stringify(terminal));
}
try {
	if (!process.env.PLAYWRIGHT_BASE_URL) {
		const url = new URL(baseURL);
		server = spawn(
			process.execPath,
			[
				'node_modules/vite/bin/vite.js',
				'preview',
				'--host',
				url.hostname,
				'--port',
				url.port,
				'--strictPort',
				'--outDir',
				build,
			],
			{ cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true }
		);
		serverClosed = new Promise((resolve) =>
			server.once('close', () => {
				serverCloseObserved = true;
				resolve();
			})
		);
		server.once('error', (error) => {
			serverSpawnError = error;
		});
		server.stdout.on('data', (data) => serverLogs.push(data));
		server.stderr.on('data', (data) => serverLogs.push(data));
		const end = Date.now() + fetchBudgetMs;
		let ready = false;
		while (Date.now() < end) {
			if (serverSpawnError) throw serverSpawnError;
			if (server.exitCode !== null)
				throw new Error(
					'Owned preview failed to start (port may be occupied)'
				);
			try {
				const r = await fetchWithin(
					baseURL,
					end - Date.now(),
					overall.signal
				);
				if (r.ok) {
					ready = true;
					break;
				}
			} catch {}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		if (serverSpawnError) throw serverSpawnError;
		if (!ready) throw new Error('Owned preview did not become ready');
	}
	const response = await fetchWithin(baseURL, fetchBudgetMs, overall.signal);
	if (
		digest(new Uint8Array(await response.arrayBuffer())) !==
		digest(await readFile(join(build, 'index.html')))
	)
		throw new Error('Served index differs from journaled production input');
	if (phase === 'all' || phase === 'matrix')
		await run(
			'matrix',
			['src/lsp/wasm/versioned-ui-test.mjs'],
			{
				PHPANTOM_MATRIX_VERSIONS: '8.0,8.3,8.5',
				PHPANTOM_MATRIX_CASES: 'all',
			},
			26
		);
	if (phase === 'all' || phase === 'review')
		await run(
			'review',
			['src/lsp/wasm/review-ui-test.mjs'],
			{ PHPANTOM_REVIEW_CASE: 'all' },
			14
		);
	if (phase === 'semantics')
		await run(
			'semantics',
			['src/lsp/wasm/review-ui-test.mjs'],
			{ PHPANTOM_REVIEW_CASE: 'semantics' },
			5
		);
} catch (error) {
	results.push({
		passed: false,
		error: String(error),
		errorName: error.name,
		exitCode: serverSpawnError
			? 127
			: error.name === 'TimeoutError' || overall.signal.aborted
				? 124
				: 1,
	});
} finally {
	clearTimeout(deadline);
	terminateOwned(server);
	if (serverClosed) {
		await serverClosed;
		await writeFile(
			join(directory, 'preview.log'),
			Buffer.concat(serverLogs),
			{ flag: 'wx' }
		);
	}
	const sourceUnchanged = (
		await Promise.all(
			sources.map(
				async (path) =>
					digest(await readFile(resolve(root, path))) ===
					start.sources[path]
			)
		)
	).every(Boolean);
	const passed =
		results.length > 0 &&
		results.every((row) => row.passed) &&
		!globalExpired &&
		sourceUnchanged &&
		git('rev-parse', 'HEAD') === head;
	const exitCode = passed
		? 0
		: globalExpired
			? 124
			: results.find((row) => !row.passed)?.exitCode || 1;
	await save('result.json', { exitCode, passed, results });
	await save('EXIT.json', {
		exitCode,
		finishedAt: new Date().toISOString(),
		head,
		headUnchanged: git('rev-parse', 'HEAD') === head,
		sourceUnchanged,
		results,
		passed,
	});
	for (const entry of await readdir(directory))
		await chmod(join(directory, entry), 0o444);
	process.exitCode = exitCode;
}
