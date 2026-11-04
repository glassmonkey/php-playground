#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import {
	expectedPhpTargets,
	parseMatrixManifest,
	validateMatrixInputs,
	expectedStrrchrSignature,
} from '../../../e2e/phpantom-contracts.mjs';
import { chromium, expect } from '@playwright/test';
import {
	installWorkerTrace,
	hoverState,
} from '../../../e2e/phpantom-observation.mjs';

const allVersions = expectedPhpTargets;
const versions =
	process.env.PHPANTOM_MATRIX_VERSIONS !== undefined
		? process.env.PHPANTOM_MATRIX_VERSIONS.split(',')
		: allVersions;
const caseSelection = process.env.PHPANTOM_MATRIX_CASES ?? 'all';
if (!['all', 'core', 'tail'].includes(caseSelection))
	throw new Error(`Unsupported matrix case selection: ${caseSelection}`);
if (new Set(versions).size !== versions.length)
	throw new Error(
		`Duplicate PHP target in matrix selection: ${versions.join(', ')}`
	);
if (versions.some((version) => !allVersions.includes(version)))
	throw new Error(`Unsupported matrix target: ${versions.join(', ')}`);
const isFullMatrix =
	caseSelection === 'all' &&
	versions.length === allVersions.length &&
	allVersions.every((version) => versions.includes(version));
const runTail = isFullMatrix || caseSelection === 'tail';
const matrixKind =
	caseSelection === 'tail'
		? 'tail-only'
		: isFullMatrix
			? 'full-matrix'
			: caseSelection === 'core' && versions.length === 1
				? 'single-target-core'
				: 'version-subset';
const targetBudgetSeconds = Object.fromEntries(
	versions.map((version) => {
		const behaviorCases =
			caseSelection === 'core'
				? 1
				: 6 + (version === '8.0' || version === '8.3' ? 1 : 0);
		const budgetSeconds =
			matrixKind === 'single-target-core'
				? 165
				: 45 + behaviorCases * 30 + 20;
		return [version, budgetSeconds];
	})
);
const overallBudgetSeconds =
	caseSelection === 'tail'
		? 165
		: matrixKind === 'single-target-core'
			? 165
			: 30 +
				Object.values(targetBudgetSeconds).reduce(
					(total, value) => total + value,
					0
				) +
				(runTail ? 3 * 90 : 0);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4176';
const batchPath =
	process.env.PHPANTOM_BATCH_RESULT ??
	resolve(repoRoot, 'assets/lsp/phpantom/manifest.json');
const outputPath =
	process.env.PHPANTOM_MATRIX_OUT ??
	resolve(repoRoot, 'build/phpantom-ui-matrix-result.json');
const batch = parseMatrixManifest(await readFile(batchPath, 'utf8'));
const rows = validateMatrixInputs(batch, versions);
const artifactByVersion = new Map(rows.map((row) => [row.phpVersion, row]));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const report = {
	baseURL,
	batchPath,
	startedAt: new Date().toISOString(),
	status: 'starting',
	versions,
	caseSelection,
	matrixKind,
	budget: {
		perTargetSeconds: targetBudgetSeconds,
		targets: {},
		globalCaseSeconds: runTail ? 90 : 0,
		overallSeconds: overallBudgetSeconds,
		model: 'single core 165s; otherwise 45s setup + 30s per behavior case + 20s reserve per target; full matrix adds 90s per 3 cross-version cases and 30s startup/finalization',
	},
	stage: 'startup',
	artifacts: [],
	cases: [],
	transitions: [],
	global: [],
};
const errors = [];
const persist = async () =>
	writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
const stage = async (value) => {
	report.stage = value;
	report.stageAt = new Date().toISOString();
	console.log(`STAGE ${report.stageAt} ${value}`);
	await persist();
};
const finishTargetBudget = async (version, startedAt) => {
	const elapsedSeconds = (Date.now() - startedAt) / 1_000;
	const target = report.budget.targets[version];
	target.finishedAt = new Date().toISOString();
	target.elapsedSeconds = Number(elapsedSeconds.toFixed(3));
	target.withinBudget = elapsedSeconds <= target.budgetSeconds;
	if (!target.withinBudget) {
		const message = `${version} target exceeded ${target.budgetSeconds}s budget (${target.elapsedSeconds}s)`;
		errors.push(message);
		console.error(`FAIL ${message}`);
	}
	await persist();
};
const recordCase = async (name, run) => {
	const caseIndex =
		report.cases.push({
			name,
			status: 'running',
			startedAt: new Date().toISOString(),
		}) - 1;
	console.log(`START ${name}`);
	await persist();
	try {
		const evidence = await run();
		report.cases[caseIndex] = {
			name,
			status: 'passed',
			finishedAt: new Date().toISOString(),
			...evidence,
		};
		console.log(`PASS ${name}`);
	} catch (error) {
		const message =
			error instanceof Error
				? `${error.name}: ${error.message}`
				: String(error);
		report.cases[caseIndex] = {
			name,
			status: 'failed',
			finishedAt: new Date().toISOString(),
			error: message,
		};
		if (
			activePage &&
			(!report.firstFailure ||
				(name.includes('hover') && !report.firstHoverFailure))
		) {
			const screenshot =
				outputPath +
				(name.includes('hover')
					? '.first-hover-failure.png'
					: '.first-failure.png');
			const failure = {
				name,
				state: await hoverState(activePage, 'first-failure').catch(
					(error) => ({ captureError: String(error) })
				),
				screenshot,
			};
			await activePage.screenshot({ path: screenshot }).catch((error) => {
				failure.screenshotError = String(error);
			});
			report.firstFailure ??= failure;
			if (name.includes('hover')) report.firstHoverFailure ??= failure;
		}
		errors.push(`${name}: ${message}`);
		console.error(`FAIL ${name}: ${message}`);
	}
	await persist();
	return report.cases[caseIndex].status === 'passed';
};
const requireThat = (condition, message) => {
	if (!condition) throw new Error(message);
};

await mkdir(resolve(outputPath, '..'), { recursive: true });
report.status = 'launching-browser';
await persist();
let browser;
let activePage;
const hardTimer = setTimeout(() => {
	report.status = 'hard-timeout';
	report.stage = `overall ${overallBudgetSeconds}s budget`;
	report.finishedAt = new Date().toISOString();
	console.error(`HARD_TIMEOUT overall ${overallBudgetSeconds}s budget`);
	void persist().finally(() => {
		void (browser ? browser.close() : Promise.resolve()).finally(() =>
			process.exit(124)
		);
	});
}, overallBudgetSeconds * 1_000);
try {
	console.log(`START browser launch (${versions.join(',')})`);
	browser = await chromium.launch({ headless: true, timeout: 10_000 });
	report.status = 'running';
	for (const version of caseSelection === 'tail' ? [] : versions) {
		const targetStartedAt = Date.now();
		report.budget.targets[version] = {
			budgetSeconds: targetBudgetSeconds[version],
			startedAt: new Date(targetStartedAt).toISOString(),
		};
		await persist();
		await stage(`version ${version}: create page`);
		const artifact = artifactByVersion.get(version);
		const page = await browser.newPage();
		activePage = page;
		page.setDefaultTimeout(7_000);
		page.setDefaultNavigationTimeout(12_000);
		const wasmResponses = [];
		await page.route('**/lsp/phpantom/php-*.wasm*', async (route) => {
			const response = await route.fetch({ timeout: 10_000 });
			const bytes = await response.body();
			wasmResponses.push({
				url: route.request().url(),
				status: response.status(),
				bytes: bytes.byteLength,
				sha256: digest(bytes),
			});
			await route.fulfill({ response, body: bytes });
		});
		await installWorkerTrace(page);
		await stage(`version ${version}: navigate`);
		await page.goto(
			`${baseURL}/?v=${encodeURIComponent(version)}&ac=1&f=console`,
			{ timeout: 15_000 }
		);
		await stage(`version ${version}: wait for Monaco`);
		await page.locator('.monaco-editor').waitFor({ state: 'visible' });
		await stage(`version ${version}: wait for initialized LSP worker`);
		const worker = await waitForReadyWorker(page, version);
		await stage(`version ${version}: wait for artifact response`);
		const response = await waitForWasmResponse(wasmResponses);
		const initialize = worker.sent.find(
			(message) => message.method === 'initialize'
		);
		const initializeResponse = worker.received.find(
			(message) => message.id === initialize.id
		);
		const artifactIdentity = {
			version,
			url: response.url,
			responseStatus: response.status,
			bytes: response.bytes,
			sha256: response.sha256,
			expectedSha256: artifact.sha256,
			expectedBuildIdentity: batch.buildIdentity,
			buildIdentity: initializeResponse.result?.serverInfo?.version,
			workerUrl: worker.url,
		};
		report.artifacts.push(artifactIdentity);
		await recordCase(`artifact ${version}`, async () => {
			requireThat(
				response.status === 200,
				`WASM response status ${response.status}`
			);
			requireThat(
				response.bytes === artifact.bytes,
				`WASM byte count ${response.bytes}, expected ${artifact.bytes}`
			);
			requireThat(
				response.sha256 === artifact.sha256,
				`WASM SHA ${response.sha256}, expected ${artifact.sha256}`
			);
			requireThat(
				new URL(response.url).searchParams.get('sha256') ===
					artifact.sha256,
				'HTTP cache URL did not carry this artifact SHA'
			);
			requireThat(
				initialize.params.initializationOptions.phpVersion === version,
				'initialize PHP version mismatch'
			);
			requireThat(
				initializeResponse.result?.serverInfo?.version ===
					batch.buildIdentity,
				'initialize server build identity mismatch'
			);
			return artifactIdentity;
		});
		const focusReady = await recordCase(
			`${version} visible editor focus preflight`,
			() => preflightEditorFocus(page)
		);
		if (!focusReady) {
			const pendingNames = [
				`${version} core strlen natural completion`,
				`${version} str_contains boundary`,
				`${version} array_last boundary`,
				`${version} named-argument boundary`,
				`${version} user variable and member completions`,
				`${version} strrchr before_needle signature boundary`,
			];
			for (const name of pendingNames) {
				report.cases.push({
					name,
					status: 'not-run',
					reason: 'visible Monaco editor focus preflight failed',
				});
			}
			await persist();
			await page.close();
			await finishTargetBudget(version, targetStartedAt);
			continue;
		}

		await recordCase(`${version} core strlen natural completion`, () =>
			completionCase(
				page,
				version,
				'<?php\nstr',
				'l',
				1,
				4,
				'strlen',
				true,
				true
			)
		);
		if (caseSelection === 'core') {
			await page.close();
			await finishTargetBudget(version, targetStartedAt);
			continue;
		}
		await recordCase(`${version} str_contains boundary`, () =>
			completionCase(
				page,
				version,
				'<?php\nstr_contain',
				's',
				1,
				12,
				'str_contains',
				compareVersions(version, '8.0') >= 0
			)
		);
		await recordCase(`${version} array_last boundary`, () =>
			completionCase(
				page,
				version,
				'<?php\narray_l',
				'a',
				1,
				8,
				'array_last',
				version === '8.5'
			)
		);
		await recordCase(`${version} named-argument boundary`, () =>
			namedArgumentCase(
				page,
				version,
				compareVersions(version, '8.0') >= 0
			)
		);
		await recordCase(
			`${version} user variable and member completions`,
			() => userSymbolCase(page, version)
		);
		await recordCase(
			`${version} strrchr before_needle signature boundary`,
			() =>
				signatureCase(
					page,
					version,
					compareVersions(version, '8.3') >= 0
				)
		);
		if (version === '8.0' || version === '8.3') {
			await recordCase(`${version} strrchr hover signature`, () =>
				hoverSignatureCase(page, version, version === '8.3')
			);
		}
		await page.close();
		await finishTargetBudget(version, targetStartedAt);
	}

	if (runTail) {
		await recordCase(
			'default and invalid autocomplete URL values remain on',
			async () => {
				const checks = [];
				for (const query of ['', '&ac=invalid']) {
					const page = await browser.newPage();
					activePage = page;
					page.setDefaultTimeout(7_000);
					page.setDefaultNavigationTimeout(12_000);
					await installWorkerTrace(page);
					const requests = [];
					page.on('request', (request) => {
						if (
							new URL(request.url()).pathname ===
							'/lsp/phpantom/php-8.5.wasm'
						)
							requests.push(request.url());
					});
					await page.goto(`${baseURL}/?v=8.5${query}`, {
						timeout: 12_000,
					});
					await waitForReadyWorker(page, '8.5');
					requireThat(
						requests.length === 1,
						`expected one PHPantom WASM request for query ${query || '(default)'}, got ${requests.length}`
					);
					const checkbox = page.locator(
						'[data-testid="checkbox-auto-complete"] input'
					);
					requireThat(
						await checkbox.isChecked(),
						`autocomplete checkbox was off for query ${query || '(default)'}`
					);
					checks.push({
						query: query || '(default)',
						url: page.url(),
						checkboxChecked: true,
						wasmRequests: requests,
					});
					await page.close();
				}
				return { checks };
			}
		);

		await recordCase(
			'ac=0 starts without PHPantom worker or WASM fetch',
			async () => {
				const page = await browser.newPage();
				activePage = page;
				page.setDefaultTimeout(7_000);
				page.setDefaultNavigationTimeout(12_000);
				await installWorkerTrace(page);
				const requests = [];
				page.on('request', (request) => {
					if (new URL(request.url()).pathname.includes('/phpantom/'))
						requests.push(request.url());
				});
				await page.goto(`${baseURL}/?v=8.5&ac=0`, {
					timeout: 12_000,
				});
				await page
					.locator('.monaco-editor')
					.waitFor({ state: 'visible' });
				await page.waitForTimeout(500);
				const workerSummaries = await traceWorkers(page);
				const phpantomWorkers = workerSummaries.filter((worker) =>
					worker.sent.some(
						(message) => message.type === 'phpantom:bootstrap'
					)
				);
				const checkbox = page.locator(
					'[data-testid="checkbox-auto-complete"] input'
				);
				requireThat(
					!(await checkbox.isChecked()),
					'autocomplete checkbox checked on ac=0'
				);
				requireThat(
					phpantomWorkers.length === 0,
					`created ${phpantomWorkers.length} PHPantom worker(s) on ac=0: ${JSON.stringify(phpantomWorkers.map((worker) => worker.url))}`
				);
				requireThat(
					requests.length === 0,
					`fetched PHPantom resource(s) on ac=0: ${requests.join(', ')}`
				);
				await page.close();
				return {
					url: `${baseURL}/?v=8.5&ac=0`,
					allWorkerUrls: workerSummaries.map((worker) => worker.url),
					phpantomWorkerCount: phpantomWorkers.length,
					phpantomRequests: requests,
				};
			}
		);

		await recordCase(
			'selector and browser history switch through old and new PHP engines',
			async () => {
				const page = await browser.newPage();
				activePage = page;
				page.setDefaultTimeout(7_000);
				page.setDefaultNavigationTimeout(12_000);
				await installWorkerTrace(page);
				await page.goto(`${baseURL}/?v=5.6&ac=1`, {
					timeout: 12_000,
				});
				const visited = [];
				for (const version of ['5.6', '7.4', '8.5', '5.6']) {
					if (new URL(page.url()).searchParams.get('v') !== version)
						await selectVersion(page, version);
					const worker = await waitForReadyWorker(page, version);
					visited.push({
						version,
						url: page.url(),
						workerUrl: worker.url,
						initializeVersion: worker.sent.find(
							(message) => message.method === 'initialize'
						).params.initializationOptions.phpVersion,
					});
				}
				await page.goBack();
				await page.waitForFunction(
					() => new URL(location.href).searchParams.get('v') === '8.5'
				);
				const backWorker = await waitForReadyWorker(page, '8.5');
				await page.goForward();
				await page.waitForFunction(
					() => new URL(location.href).searchParams.get('v') === '5.6'
				);
				const forwardWorker = await waitForReadyWorker(page, '5.6');
				await page.reload();
				const reloadWorker = await waitForReadyWorker(page, '5.6');
				requireThat(
					visited.map((item) => item.version).join(',') ===
						'5.6,7.4,8.5,5.6',
					'selector cycle did not preserve requested versions'
				);
				requireThat(
					backWorker.sent.find(
						(message) => message.method === 'initialize'
					).params.initializationOptions.phpVersion === '8.5',
					'browser back did not initialize 8.5'
				);
				requireThat(
					forwardWorker.sent.find(
						(message) => message.method === 'initialize'
					).params.initializationOptions.phpVersion === '5.6',
					'browser forward did not initialize 5.6'
				);
				requireThat(
					reloadWorker.sent.find(
						(message) => message.method === 'initialize'
					).params.initializationOptions.phpVersion === '5.6',
					'reload did not initialize 5.6'
				);
				await page.close();
				return {
					visited,
					back: { version: '8.5', workerUrl: backWorker.url },
					forward: { version: '5.6', workerUrl: forwardWorker.url },
					reload: { version: '5.6', workerUrl: reloadWorker.url },
				};
			}
		);
	}
} catch (error) {
	const message =
		error instanceof Error
			? `${error.name}: ${error.message}`
			: String(error);
	report.status = 'startup-error';
	errors.push(message);
	console.error(`RUNNER_ERROR ${message}`);
} finally {
	clearTimeout(hardTimer);
	if (browser) await browser.close();
}

report.finishedAt = new Date().toISOString();
report.summary = {
	passed: report.cases.filter((item) => item.status === 'passed').length,
	failed: report.cases.filter((item) => item.status === 'failed').length,
};
report.errors = errors;
if (report.status !== 'startup-error' && report.status !== 'hard-timeout')
	report.status = errors.length > 0 ? 'complete-with-failures' : 'complete';
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
	JSON.stringify({ outputPath, summary: report.summary, errors }, null, 2)
);
if (errors.length > 0 || report.status === 'startup-error')
	process.exitCode = 1;

async function waitForReadyWorker(page, version) {
	await page.waitForFunction(
		(wanted) =>
			window.__phpantomMatrix?.workers.some((worker) => {
				const initialize = worker.sent.find(
					(message) =>
						message.method === 'initialize' &&
						message.params?.initializationOptions?.phpVersion ===
							wanted
				);
				return (
					initialize &&
					worker.received.some(
						(message) =>
							message.id === initialize.id &&
							message.result?.serverInfo?.version
					)
				);
			}),
		version,
		{ timeout: 10_000 }
	);
	const workers = await traceWorkers(page);
	const ready = workers.filter((worker) => {
		const initialize = worker.sent.find(
			(message) =>
				message.method === 'initialize' &&
				message.params?.initializationOptions?.phpVersion === version
		);
		return (
			initialize &&
			worker.received.some(
				(message) =>
					message.id === initialize.id &&
					message.result?.serverInfo?.version
			)
		);
	});
	return ready.at(-1);
}

async function traceWorkers(page) {
	return page.evaluate(() => window.__phpantomMatrix?.workers ?? []);
}

async function waitForWasmResponse(responses) {
	const deadline = Date.now() + 10_000;
	while (responses.length === 0) {
		if (Date.now() > deadline)
			throw new Error(
				'Timed out waiting for versioned PHPantom WASM response.'
			);
		await new Promise((resolveWait) => setTimeout(resolveWait, 50));
	}
	return responses.at(-1);
}

async function replaceDocument(page, source) {
	await page.keyboard.press('Escape');
	const editorIdentity = await page
		.locator('.monaco-editor')
		.first()
		.evaluate((editor) => ({
			className: editor.className,
			platform: navigator.platform,
			userAgent: navigator.userAgent,
		}));
	const selectAllKey =
		editorIdentity.className.split(/\s+/).includes('mac') ||
		editorIdentity.platform.startsWith('Mac')
			? 'Meta+A'
			: 'Control+A';
	await page.keyboard.press(selectAllKey);
	await page
		.context()
		.grantPermissions(['clipboard-read', 'clipboard-write'], {
			origin: new URL(baseURL).origin,
		});
	await page.evaluate(async (content) => {
		await navigator.clipboard.writeText(content);
	}, source);
	await page.keyboard.press(
		selectAllKey === 'Meta+A' ? 'Meta+V' : 'Control+V'
	);
	try {
		await page.waitForFunction(
			(expected) =>
				window.__phpantomMatrix?.workers.some((worker) =>
					worker.sent.some(
						(message) =>
							message.method === 'textDocument/didChange' &&
							message.params?.contentChanges?.some(
								(change) => change.text === expected
							)
					)
				),
			source,
			{ timeout: 10_000 }
		);
	} catch (error) {
		const observed = await page.evaluate(() => {
			const workers = window.__phpantomMatrix?.workers ?? [];
			const changes = workers.flatMap((worker) =>
				worker.sent
					.filter(
						(message) => message.method === 'textDocument/didChange'
					)
					.map((message) => ({
						workerUrl: worker.url,
						version: message.params?.textDocument?.version,
						texts: message.params?.contentChanges?.map(
							(change) => change.text
						),
					}))
			);
			const editor = document.querySelector('.monaco-editor');
			const active = document.activeElement;
			return {
				changes: changes.slice(-6),
				visibleText:
					editor?.querySelector('.view-lines')?.textContent ?? null,
				editorClass: editor?.className ?? null,
				active: {
					tagName: active?.tagName ?? null,
					className:
						typeof active?.className === 'string'
							? active.className
							: '',
					insideMonaco: active?.closest('.monaco-editor') !== null,
				},
			};
		});
		throw new Error(
			`didChange fixture text was not observed; expected=${JSON.stringify(source)}; observed=${JSON.stringify(observed)}; selectAllKey=${selectAllKey}; editorIdentity=${JSON.stringify(editorIdentity)}; cause=${error}`
		);
	}
	const worker = await latestWorker(page);
	const change = worker.sent
		.filter(
			(message) =>
				message.method === 'textDocument/didChange' &&
				message.params?.contentChanges?.some(
					(entry) => entry.text === source
				)
		)
		.at(-1);
	requireThat(
		change.params.contentChanges[0].text === source,
		'actual didChange model text differs from fixture'
	);
	return {
		worker,
		documentVersion: change.params.textDocument.version,
		text: source,
		selectAllKey,
		editorIdentity,
		fixtureInputMethod: 'clipboard paste into focused editor',
	};
}

async function preflightEditorFocus(page) {
	const editorSurface = page.locator('.monaco-editor .view-lines').first();
	await editorSurface.waitFor({ state: 'visible' });
	await editorSurface.click({ position: { x: 24, y: 14 } });
	const activeEditor = await page.evaluate(() => {
		const active = document.activeElement;
		const insideMonaco = active?.closest('.monaco-editor') !== null;
		const className =
			typeof active?.className === 'string' ? active.className : '';
		const focusMode =
			active?.tagName === 'TEXTAREA'
				? 'textarea'
				: className.split(/\s+/).includes('native-edit-context')
					? 'native-edit-context'
					: active instanceof HTMLElement && active.isContentEditable
						? 'contenteditable'
						: 'unknown';
		return {
			tagName: active?.tagName ?? null,
			className,
			insideMonaco,
			focusMode,
		};
	});
	requireThat(
		activeEditor.insideMonaco && activeEditor.focusMode !== 'unknown',
		`visible editor click did not focus Monaco input: ${JSON.stringify(activeEditor)}`
	);
	return { activeEditor, editorText: await editorSurface.innerText() };
}

async function latestWorker(page) {
	const workers = await traceWorkers(page);
	return workers
		.filter((worker) =>
			worker.sent.some((message) => message.method === 'initialize')
		)
		.at(-1);
}

async function complete(page, expectedPosition, previousCount) {
	const { worker, request } = await waitForRequest(
		page,
		'textDocument/completion',
		previousCount,
		expectedPosition
	);
	const response = await waitForResponse(page, request.id);
	requireThat(
		!response.error,
		`completion returned JSON-RPC error: ${JSON.stringify(response.error)}`
	);
	requireThat(
		request.params.position.line === expectedPosition.line &&
			request.params.position.character === expectedPosition.character,
		`cursor was ${JSON.stringify(request.params.position)}, expected ${JSON.stringify(expectedPosition)}`
	);
	return { worker, request, response };
}

async function completionCase(
	page,
	version,
	source,
	suffix,
	line,
	character,
	target,
	shouldExist,
	verifyInsertion = false
) {
	const initial = await replaceDocument(page, source);
	const previousCount = initial.worker.sent.filter(
		(message) => message.method === 'textDocument/completion'
	).length;
	await page.keyboard.type(suffix, { delay: 35 });
	const expectedText = source + suffix;
	await page.waitForFunction(
		(expected) =>
			window.__phpantomMatrix?.workers.some((worker) =>
				worker.sent.some(
					(message) =>
						message.method === 'textDocument/didChange' &&
						message.params?.contentChanges?.some(
							(change) => change.text === expected
						)
				)
			),
		expectedText,
		{ timeout: 10_000 }
	);
	const latest = await latestWorker(page);
	const actualText = latest.sent
		.filter((message) => message.method === 'textDocument/didChange')
		.at(-1).params.contentChanges[0].text;
	requireThat(
		actualText === expectedText,
		`model text mismatch before ${target}: ${JSON.stringify(actualText)}`
	);
	const { request, response } = await complete(
		page,
		{ line, character },
		previousCount
	);
	const items = normalizeCompletionItems(response.result);
	const matching = items.filter((item) =>
		String(item.label).includes(target)
	);
	const rows = await visibleSuggestionRows(page);
	requireThat(
		shouldExist ? matching.length > 0 : matching.length === 0,
		`${target} raw completion ${shouldExist ? 'missing' : 'unexpected'}; labels=${JSON.stringify(items.map((item) => item.label))}`
	);
	requireThat(
		shouldExist
			? rows.some((row) => row.includes(target))
			: !rows.some((row) => row.includes(target)),
		`${target} Monaco row ${shouldExist ? 'missing' : 'unexpected'}; rows=${JSON.stringify(rows)}`
	);
	let insertion;
	if (shouldExist && verifyInsertion) {
		const exactRowIndex = rows.findIndex((row) => row.trim() === target);
		requireThat(
			exactRowIndex >= 0,
			`${target} exact Monaco row missing before insertion; rows=${JSON.stringify(rows)}`
		);
		await page
			.locator('.suggest-widget .monaco-list-row')
			.nth(exactRowIndex)
			.click();
		await page.waitForFunction(
			(before) =>
				(window.__phpantomMatrix?.workers ?? []).some((worker) =>
					worker.sent.some(
						(message) =>
							message.method === 'textDocument/didChange' &&
							message.params?.contentChanges?.some(
								(change) => change.text !== before
							)
					)
				),
			expectedText,
			{ timeout: 5_000 }
		);
		const afterInsertion = await latestWorker(page);
		const insertedChange = afterInsertion.sent
			.filter(
				(message) =>
					message.method === 'textDocument/didChange' &&
					message.params?.contentChanges?.some(
						(change) => change.text !== expectedText
					)
			)
			.at(-1);
		const insertedText = insertedChange.params.contentChanges[0].text;
		const typedToken = expectedText.match(/[a-zA-Z_\\]+$/)?.[0] ?? '';
		const expectedIdentifierText =
			expectedText.slice(0, -typedToken.length) + target;
		requireThat(
			insertedText.startsWith(expectedIdentifierText),
			`accepted UI item did not insert ${target}; text=${JSON.stringify(insertedText)}; expected prefix=${JSON.stringify(expectedIdentifierText)}`
		);
		insertion = {
			selectedRow: rows[exactRowIndex],
			before: expectedText,
			after: insertedText,
			documentVersion: insertedChange.params.textDocument.version,
		};
	}
	return {
		version,
		text: actualText,
		documentVersion: latest.sent
			.filter((message) => message.method === 'textDocument/didChange')
			.at(-1).params.textDocument.version,
		cursor: request.params.position,
		requestId: request.id,
		responseId: response.id,
		target,
		shouldExist,
		rawLabels: items.map((item) => item.label),
		monacoRows: rows,
		...(insertion ? { insertion } : {}),
	};
}

async function namedArgumentCase(page, version, shouldExist) {
	const sourceBeforeOpenParen =
		"<?php\nclass Greeter {\n    public function greet(string $name, int $age): string {\n        return '';\n    }\n    public function test() {\n        $this->greet(";
	const initial = await replaceDocument(page, sourceBeforeOpenParen);
	const previousCount = initial.worker.sent.filter(
		(message) => message.method === 'textDocument/completion'
	).length;
	await page.keyboard.press('Control+Space');
	const { request, response } = await complete(
		page,
		{ line: 6, character: 21 },
		previousCount
	);
	const labels = normalizeCompletionItems(response.result).map((item) =>
		String(item.label)
	);
	const isNamedParameter = (label, name) =>
		new RegExp(`^${name}\\s*(?::|$)`, 'i').test(label.trim());
	const nameAvailable = labels.some((label) =>
		isNamedParameter(label, 'name')
	);
	const ageAvailable = labels.some((label) => isNamedParameter(label, 'age'));
	requireThat(
		shouldExist
			? nameAvailable && ageAvailable
			: !nameAvailable && !ageAvailable,
		`named argument candidates mismatch: ${JSON.stringify(labels)}`
	);
	const rows = await visibleSuggestionRows(page);
	requireThat(
		shouldExist
			? rows.some((row) => isNamedParameter(row, 'name')) &&
					rows.some((row) => isNamedParameter(row, 'age'))
			: !rows.some(
					(row) =>
						isNamedParameter(row, 'name') ||
						isNamedParameter(row, 'age')
				),
		`named argument UI rows mismatch: ${JSON.stringify(rows)}`
	);
	return {
		version,
		text: sourceBeforeOpenParen,
		cursor: request.params.position,
		requestId: request.id,
		responseId: response.id,
		shouldExist,
		rawLabels: labels,
		monacoRows: rows,
	};
}

async function userSymbolCase(page, version) {
	const localSource =
		'<?php\nclass MatrixProbe {\n    public string $propertyProbe;\n    public function methodProbe(): void {}\n}\n$localProbe = new MatrixProbe();\n$local';
	const local = await replaceDocument(page, localSource);
	const localCount = local.worker.sent.filter(
		(message) => message.method === 'textDocument/completion'
	).length;
	await page.keyboard.type('P', { delay: 35 });
	const localExpectedText = `${localSource}P`;
	await page.waitForFunction(
		(expected) =>
			window.__phpantomMatrix?.workers.some((worker) =>
				worker.sent.some(
					(message) =>
						message.method === 'textDocument/didChange' &&
						message.params?.contentChanges?.some(
							(change) => change.text === expected
						)
				)
			),
		localExpectedText,
		{ timeout: 10_000 }
	);
	const variable = await complete(
		page,
		{ line: 6, character: 7 },
		localCount
	);
	const variableLabels = normalizeCompletionItems(
		variable.response.result
	).map((item) => String(item.label));
	requireThat(
		variableLabels.some((label) => label.includes('$localProbe')),
		`local variable missing: ${JSON.stringify(variableLabels)}`
	);
	requireThat(
		(await visibleSuggestionRows(page)).some((row) =>
			row.includes('$localProbe')
		),
		'local variable missing from Monaco rows'
	);

	const memberSource =
		'<?php\nclass MatrixProbe {\n    public string $propertyProbe;\n    public function methodProbe(): void {}\n}\n$instance = new MatrixProbe();\n$instance-';
	const member = await replaceDocument(page, memberSource);
	const memberCount = member.worker.sent.filter(
		(message) => message.method === 'textDocument/completion'
	).length;
	await page.keyboard.type('>', { delay: 35 });
	const { request, response } = await complete(
		page,
		{ line: 6, character: 11 },
		memberCount
	);
	const labels = normalizeCompletionItems(response.result).map((item) =>
		String(item.label)
	);
	requireThat(
		labels.some((label) => label.includes('propertyProbe')) &&
			labels.some((label) => label.includes('methodProbe')),
		`member symbols missing: ${JSON.stringify(labels)}`
	);
	const rows = await visibleSuggestionRows(page);
	requireThat(
		rows.some((row) => row.includes('propertyProbe')) &&
			rows.some((row) => row.includes('methodProbe')),
		`member UI rows missing: ${JSON.stringify(rows)}`
	);
	return {
		version,
		variable: {
			text: localExpectedText,
			cursor: variable.request.params.position,
			labels: variableLabels,
		},
		member: {
			text: memberSource + '>',
			cursor: request.params.position,
			labels,
			monacoRows: rows,
		},
	};
}

async function signatureCase(page, version, shouldHaveThirdParameter) {
	const source = '<?php\nstrrchr(';
	const initial = await replaceDocument(page, source);
	const beforeCount = initial.worker.sent.filter(
		(message) => message.method === 'textDocument/signatureHelp'
	).length;
	const tail = '"haystack", "needle",';
	await page.keyboard.type(tail, { delay: 20 });
	const text = source + tail;
	await page.waitForFunction(
		(expected) =>
			window.__phpantomMatrix?.workers.some((worker) =>
				worker.sent.some(
					(message) =>
						message.method === 'textDocument/didChange' &&
						message.params?.contentChanges?.some(
							(change) => change.text === expected
						)
				)
			),
		text,
		{ timeout: 10_000 }
	);
	await latestWorker(page);
	const { request } = await waitForRequest(
		page,
		'textDocument/signatureHelp',
		beforeCount,
		{ line: 1, character: text.split('\n')[1].length }
	);
	const response = await waitForResponse(page, request.id);
	requireThat(
		!response.error,
		`signature help returned JSON-RPC error: ${JSON.stringify(response.error)}`
	);
	requireThat(
		request.params.position.line === 1 &&
			request.params.position.character === text.split('\n')[1].length,
		`signature cursor mismatch: ${JSON.stringify(request.params.position)}`
	);
	const signatures = response.result?.signatures ?? [];
	const parameters = signatures
		.flatMap((signature) => signature.parameters ?? [])
		.map((parameter) =>
			typeof parameter.label === 'string'
				? parameter.label
				: JSON.stringify(parameter.label)
		);
	const hasBeforeNeedle =
		parameters.some((label) => label.includes('before_needle')) ||
		signatures.some((signature) =>
			String(signature.label).includes('before_needle')
		);
	requireThat(signatures.length > 0, 'signature help returned no signatures');
	requireThat(
		hasBeforeNeedle === shouldHaveThirdParameter,
		`before_needle availability mismatch; parameters=${JSON.stringify(parameters)}, signatures=${JSON.stringify(signatures.map((item) => item.label))}`
	);
	const expectedSignature = expectedStrrchrSignature(version);
	const actualDocument = (await latestWorker(page)).sent
		.filter((message) => message.method === 'textDocument/didChange')
		.at(-1)?.params.contentChanges[0].text;
	expect({
		functionName: actualDocument?.match(/\n([a-z_]+)\(/)?.[1],
		signatures: signatures.map((signature) => ({
			label: signature.label,
			parameters: (signature.parameters ?? []).map((parameter) =>
				typeof parameter.label === 'string'
					? parameter.label
					: signature.label.slice(...parameter.label)
			),
		})),
		activeSignature: response.result.activeSignature,
		activeParameter: response.result.activeParameter,
		document: actualDocument,
	}).toEqual({
		...expectedSignature,
		document: '<?php\nstrrchr("haystack", "needle",',
	});
	const widget = page.locator('.parameter-hints-widget:visible');
	await expect(widget).toBeVisible();
	await expect(widget.locator('.signature .code')).toHaveText(
		expectedSignature.signatures[0].label
	);
	await expect(widget.locator('.parameter.active')).toHaveText(
		expectedSignature.signatures[0].parameters[
			expectedSignature.activeParameter
		]
	);
	await expect(widget).toContainText('$haystack');
	await expect(widget).toContainText('$needle');
	if (shouldHaveThirdParameter)
		await expect(widget).toContainText('$before_needle');
	else await expect(widget).not.toContainText('$before_needle');
	return {
		version,
		text,
		cursor: request.params.position,
		requestId: request.id,
		responseId: response.id,
		signatureLabels: signatures.map((item) => item.label),
		parameterLabels: parameters,
		visibleSignature: await widget.innerText(),
		expectedSignature,
		activeParameter: response.result.activeParameter,
		shouldHaveThirdParameter,
	};
}

async function hoverSignatureCase(page, version, shouldHaveThirdParameter) {
	const source = '<?php\nstrrchr("haystack", "needle");';
	const openedDocument = await replaceDocument(page, source);
	await page.waitForFunction(
		(expected) =>
			window.__phpantomMatrix?.workers.some((worker) =>
				worker.sent.some(
					(message) =>
						message.method === 'textDocument/didChange' &&
						message.params?.contentChanges?.some(
							(change) => change.text === expected
						)
				)
			),
		source,
		{ timeout: 10_000 }
	);
	const position = await page
		.locator('.view-line')
		.nth(1)
		.evaluate((line) => {
			const walker = document.createTreeWalker(
				line,
				NodeFilter.SHOW_TEXT
			);
			let node;
			while ((node = walker.nextNode())) {
				const start = node.textContent.indexOf('strrchr');
				if (start < 0) continue;
				const range = document.createRange();
				range.setStart(node, start + 3);
				range.setEnd(node, start + 4);
				const rect = range.getBoundingClientRect();
				const point = {
					x: rect.x + rect.width / 2,
					y: rect.y + rect.height / 2,
				};
				window.__quality.hoverPoint = point;
				window.__qualityCapture('before-original-hover-moves', point);
				return point;
			}
			return null;
		});
	requireThat(
		position,
		'could not locate strrchr token in rendered Monaco line'
	);
	const beforeCount = openedDocument.worker.sent.filter(
		(message) => message.method === 'textDocument/hover'
	).length;
	await page.mouse.move(position.x - 6, position.y);
	await page.mouse.move(position.x, position.y);
	const { request } = await waitForRequest(
		page,
		'textDocument/hover',
		beforeCount
	);
	const response = await waitForResponse(page, request.id);
	requireThat(
		!response.error,
		`hover returned JSON-RPC error: ${JSON.stringify(response.error)}`
	);
	requireThat(
		request.params.position.line === 1 &&
			request.params.position.character >= 3 &&
			request.params.position.character <= 4,
		`hover cursor did not resolve onto strrchr: ${JSON.stringify(request.params.position)}`
	);
	const raw = JSON.stringify(response.result?.contents ?? '');
	const signature =
		hoverText(response.result?.contents).match(
			/function\s+strrchr\s*\(([^)]*)\)/i
		)?.[1] ?? '';
	requireThat(
		signature.length > 0,
		`hover response did not contain a parseable strrchr signature: ${raw}`
	);
	const hasThird = /before_needle/.test(signature);
	requireThat(
		hasThird === shouldHaveThirdParameter,
		`hover signature parameter mismatch: ${signature}`
	);
	const hover = page.locator('.monaco-hover:visible');
	await expect(hover).toBeVisible();
	await expect(hover).toContainText('function strrchr(');
	await expect(hover).toContainText('$haystack');
	await expect(hover).toContainText('$needle');
	if (shouldHaveThirdParameter)
		await expect(hover).toContainText('$before_needle');
	else await expect(hover).not.toContainText('$before_needle');
	const tooltip = await hover.innerText();
	return {
		version,
		text: source,
		cursor: request.params.position,
		requestId: request.id,
		responseId: response.id,
		rawContents: response.result?.contents,
		signature,
		tooltip,
		observation: await hoverState(page, 'hover-complete'),
		shouldHaveThirdParameter,
	};
}

async function visibleSuggestionRows(page) {
	await page.waitForTimeout(200);
	return page
		.locator('.suggest-widget .monaco-list-row')
		.allInnerTexts()
		.catch(() => []);
}

function normalizeCompletionItems(result) {
	if (Array.isArray(result)) return result;
	return Array.isArray(result?.items) ? result.items : [];
}

function hoverText(contents) {
	if (typeof contents === 'string') return contents;
	if (Array.isArray(contents))
		return contents
			.map((item) =>
				typeof item === 'string' ? item : (item?.value ?? '')
			)
			.join('\n');
	if (typeof contents?.value === 'string') return contents.value;
	return '';
}

async function waitForRequest(page, method, previousCount, expectedPosition) {
	const deadline = Date.now() + 8_000;
	while (Date.now() < deadline) {
		const worker = await latestWorker(page);
		const requests = worker.sent.filter(
			(message) => message.method === method
		);
		const request = requests
			.slice(previousCount)
			.find(
				(message) =>
					!expectedPosition ||
					(message.params?.position?.line === expectedPosition.line &&
						message.params?.position?.character ===
							expectedPosition.character)
			);
		if (request) return { worker, request };
		await new Promise((resolveWait) => setTimeout(resolveWait, 50));
	}
	const worker = await latestWorker(page);
	const requests = worker.sent
		.filter((message) => message.method === method)
		.slice(previousCount)
		.map((message) => ({
			id: message.id,
			position: message.params?.position,
			context: message.params?.context,
		}));
	const lastTextChange = worker.sent
		.filter((message) => message.method === 'textDocument/didChange')
		.at(-1);
	throw new Error(
		`Timed out waiting for ${method}; previous count ${previousCount}; expectedPosition=${JSON.stringify(expectedPosition)}; observedRequests=${JSON.stringify(requests)}; latestDocumentVersion=${lastTextChange?.params?.textDocument?.version ?? null}; latestDocumentTexts=${JSON.stringify(lastTextChange?.params?.contentChanges?.map((change) => change.text) ?? [])}`
	);
}

async function waitForResponse(page, id) {
	const deadline = Date.now() + 8_000;
	while (Date.now() < deadline) {
		const worker = await latestWorker(page);
		const response = worker.received.find((message) => message.id === id);
		if (response) return response;
		await new Promise((resolveWait) => setTimeout(resolveWait, 50));
	}
	const worker = await latestWorker(page);
	throw new Error(
		`Timed out waiting for response ${String(id)}; recentResponses=${JSON.stringify(worker.received.slice(-8).map((message) => ({ id: message.id, method: message.method, hasResult: message.result !== undefined, error: message.error })))}`
	);
}

async function selectVersion(page, version) {
	await page.locator('#select-input-php').click();
	await page.getByRole('option', { name: version, exact: true }).click();
	await page.waitForFunction(
		(target) => new URL(location.href).searchParams.get('v') === target,
		version
	);
}

function compareVersions(left, right) {
	const [leftMajor, leftMinor] = left.split('.').map(Number);
	const [rightMajor, rightMinor] = right.split('.').map(Number);
	return leftMajor - rightMajor || leftMinor - rightMinor;
}
