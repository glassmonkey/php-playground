import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const app = process.argv[2] ?? 'phpactor';
const expectedHead = process.argv[3];
const managerReadyRef = process.argv[4];
if (!['phpantom', 'phpactor'].includes(app) || !/^[0-9a-f]{40}$/i.test(expectedHead ?? '') || !managerReadyRef) {
	throw new Error('Usage: node diagnose-natural-state-changes.mjs <phpantom|phpactor> <manager-confirmed-source-head> <manager-ready-reference>');
}
const repoRoot = '/Users/glassmonkey/src/github.com/glassmonkey/php-playground';
const sourcePath = path.join(repoRoot, '..', 'php-playground-wt', app === 'phpactor' ? 'gla-115-lsp-phpactor-preview' : 'gla-115-lsp-preview');
const sourceHead = execFileSync('git', ['-C', sourcePath, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sourceDirty = execFileSync('git', ['-C', sourcePath, 'status', '--porcelain'], { encoding: 'utf8' }).trim();
if (sourceHead !== expectedHead || sourceDirty) throw new Error(`Source identity mismatch or dirty worktree: ${sourceHead} / dirty=${Boolean(sourceDirty)}`);

const require = createRequire(path.join(repoRoot, 'node_modules', 'playwright', 'package.json'));
const { chromium } = require('playwright');
const port = app === 'phpactor' ? 3471 : 7260;
const baseURL = `http://127.0.0.1:${port}/?v=8.5&f=html`;
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const outDir = path.resolve('docs/lsp/ui-evaluation/evidence', `${app}-natural-state-after-fix-${runId}`);
await fs.mkdir(outDir, { recursive: true });
const fixture = await fs.readFile('docs/lsp/ui-evaluation/fixture.php', 'utf8');
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
const errors = [];

async function openContext(name) {
	const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
	await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL.slice(0, -1) });
	const page = await context.newPage();
	const assets = [];
	const pageErrors = [];
	const consoleErrors = [];
	const completionTrace = [];
	page.on('pageerror', (error) => { pageErrors.push(error.message); errors.push({ case: name, type: 'pageerror', message: error.message }); });
	page.on('console', async (message) => {
		if (message.type() === 'error') { consoleErrors.push(message.text()); errors.push({ case: name, type: 'console', message: message.text() }); }
		if (message.type() === 'info' && message.text().includes('[phpactor-lsp]')) {
			completionTrace.push({ text: message.text(), values: await Promise.all(message.args().map((arg) => arg.jsonValue().catch(() => null))) });
		}
	});
	page.on('response', async (response) => {
		if (!['script', 'stylesheet'].includes(response.request().resourceType())) return;
		try {
			const body = await response.body();
			const headers = await response.allHeaders();
			assets.push({ url: response.url(), status: response.status(), etag: headers.etag ?? null, lastModified: headers['last-modified'] ?? null, contentLength: body.length, sha256: createHash('sha256').update(body).digest('hex') });
		} catch (error) { assets.push({ url: response.url(), status: response.status(), readError: error.message }); }
	});
	await page.addInitScript(() => {
		if (location.port === '3471') localStorage.setItem('phpactorLspTrace', '1');
		window.__lspObserved = [];
		window.__workerEvents = [];
		window.__workerUrls = [];
		window.__heldResponses = [];
		window.__completionRequestIds = [];
		window.__holdFirstCompletion = false;
		window.__suggestSnapshots = [];
		const scan = () => {
			const widget = document.querySelector('.suggest-widget');
			const style = widget ? getComputedStyle(widget) : null;
			const rect = widget?.getBoundingClientRect();
			const rows = [...(widget?.querySelectorAll('.monaco-list-row') ?? [])].map((row) => row.innerText);
			const visible = Boolean(widget && rows.length && rect?.width > 0 && rect?.height > 0 && style?.display !== 'none' && style?.visibility !== 'hidden' && Number(style?.opacity ?? 1) > 0);
			const snapshot = { at: performance.now(), visible, rows };
			const previous = window.__suggestSnapshots.at(-1);
			if (!previous || previous.visible !== visible || JSON.stringify(previous.rows) !== JSON.stringify(rows)) window.__suggestSnapshots.push(snapshot);
		};
		new MutationObserver(() => requestAnimationFrame(scan)).observe(document, { subtree: true, childList: true, attributes: true, characterData: true, attributeFilter: ['class', 'style', 'aria-hidden'] });
		const NativeWorker = window.Worker;
		window.__workers = [];
		window.Worker = class extends NativeWorker {
			constructor(...args) {
				super(...args);
				window.__workerUrls.push(String(args[0]));
				window.__workers.push(this);
				this.addEventListener('message', (event) => {
					const data = event.data;
					if (data?.jsonrpc !== '2.0' || (data.id === undefined && !data.method?.startsWith('textDocument/'))) return;
					if (window.__holdFirstCompletion && window.__completionRequestIds.includes(data.id) && !window.__heldResponses.length) {
						window.__heldResponses.push({ at: performance.now(), data });
						window.__workerEvents.push({ event: 'completion-response-held', at: performance.now(), id: data.id });
						event.stopImmediatePropagation();
						return;
					}
					window.__lspObserved.push({ direction: 'worker->ui', at: performance.now(), id: data.id, method: data.method, result: data.result, error: data.error });
				});
			}
			postMessage(data, ...args) {
				if (data?.jsonrpc === '2.0' && (data.id !== undefined || data.method?.startsWith('textDocument/'))) {
					window.__lspObserved.push({ direction: 'ui->worker', at: performance.now(), id: data.id, method: data.method, params: data.params });
					if (data.method === 'textDocument/completion') window.__completionRequestIds.push(data.id);
				}
				return super.postMessage(data, ...args);
			}
			terminate() {
				window.__workerEvents.push({ event: 'worker-terminate', at: performance.now() });
				return super.terminate();
			}
		};
	});
	await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
	await page.locator('.monaco-editor .view-lines').waitFor({ timeout: 30000 });
	const checkbox = page.getByTestId('checkbox-completion');
	if (!(await checkbox.isChecked().catch(() => false))) await checkbox.click();
	await page.waitForFunction(() => window.__lspObserved?.some((event) => event.direction === 'ui->worker' && event.method === 'initialize') && window.__lspObserved?.some((event) => event.direction === 'worker->ui' && event.result?.capabilities), undefined, { timeout: 30000 });
	return { context, page, assets, pageErrors, consoleErrors, completionTrace, checkbox };
}

async function pasteFixture(page) {
	const start = await page.evaluate(() => performance.now());
	await page.evaluate((text) => navigator.clipboard.writeText(text), fixture);
	await page.locator('.monaco-editor').first().click({ position: { x: 250, y: 160 } });
	await page.keyboard.press('Meta+A');
	await page.keyboard.press('Meta+V');
	await page.waitForFunction(({ text, at }) => {
		const changed = window.__lspObserved?.some((event) => event.direction === 'ui->worker' && event.method === 'textDocument/didChange' && event.at >= at && event.params?.contentChanges?.some((change) => change.text === text));
		const visibleText = document.querySelector('.monaco-editor .view-lines')?.innerText?.replaceAll('\u00a0', ' ').trimEnd();
		return changed || visibleText === text.trimEnd();
	}, { text: fixture, at: start }, { timeout: 5000 });
	await page.keyboard.press('Control+End');
	return start;
}

async function visibleState(page) {
	return page.evaluate(() => {
		const widget = document.querySelector('.suggest-widget');
		const style = widget ? getComputedStyle(widget) : null;
		const rect = widget?.getBoundingClientRect();
		const rows = [...(widget?.querySelectorAll('.monaco-list-row') ?? [])].map((row) => row.innerText);
		const cursor = document.querySelector('.monaco-editor .cursors-layer .cursor');
		const cursorRect = cursor?.getBoundingClientRect();
		return { editorText: document.querySelector('.monaco-editor .view-lines')?.innerText?.replaceAll('\u00a0', ' ') ?? null, activeElement: document.activeElement?.className?.toString?.() ?? null, version: document.querySelector('[class*="singleValue"]')?.innerText ?? null, completionChecked: document.querySelector('[data-testid="checkbox-completion"] input')?.checked ?? null, rows, visible: Boolean(widget && rows.length && rect?.width > 0 && rect?.height > 0 && style?.display !== 'none' && style?.visibility !== 'hidden' && Number(style?.opacity ?? 1) > 0), cursor: cursorRect ? { left: cursorRect.left, top: cursorRect.top, width: cursorRect.width, height: cursorRect.height } : null };
	});
}

async function snapshot(appContext, caseName, extra = {}) {
	const { page, assets, pageErrors, consoleErrors, completionTrace } = appContext;
	const events = await page.evaluate(() => window.__lspObserved);
	const workerEvents = await page.evaluate(() => window.__workerEvents);
	const snapshots = await page.evaluate(() => window.__suggestSnapshots);
	const workerUrls = await page.evaluate(() => window.__workerUrls);
	const state = await visibleState(page);
	const filename = `${caseName}.png`;
	await page.screenshot({ path: path.join(outDir, filename) });
	const evidence = { case: caseName, sourceHead, managerReadyRef, url: baseURL, browser: browser.version(), phpVersion: state.version, fixture, state, events, workerEvents, snapshots, workerUrls, assets, completionTrace, pageErrors, consoleErrors, screenshot: filename, ...extra };
	await fs.writeFile(path.join(outDir, `${caseName}-trace.json`), JSON.stringify(evidence, null, 2));
	return evidence;
}

const cases = [];
try {
	// Feature-off test: stop a pending natural completion by disabling the UI and verify no automatic request survives.
	{
		const appContext = await openContext('completion-off-no-retry');
		const { page, context, checkbox } = appContext;
		await pasteFixture(page);
		await page.evaluate(() => { window.__holdFirstCompletion = true; });
		const inputAt = await page.evaluate(() => performance.now());
		await page.keyboard.type('s', { delay: 80 });
		await page.waitForFunction(() => window.__lspObserved?.some((event) => event.direction === 'ui->worker' && event.method === 'textDocument/completion'), undefined, { timeout: 8000 }).catch(() => {});
		await page.waitForFunction(() => window.__heldResponses?.length > 0, undefined, { timeout: 15000 }).catch(() => {});
		const held = await page.evaluate(() => window.__heldResponses.map(({ at, data }) => ({ at, id: data.id })));
		const offAt = await page.evaluate(() => performance.now());
		await checkbox.click();
		await page.waitForTimeout(1400);
		const offEvents = await page.evaluate(() => window.__lspObserved);
		const afterOffRequests = offEvents.filter((event) => event.direction === 'ui->worker' && event.method === 'textDocument/completion' && event.at >= offAt);
		const afterOffChanges = offEvents.filter((event) => event.direction === 'ui->worker' && event.method === 'textDocument/didChange' && event.at >= offAt);
		const afterOffState = await visibleState(page);
		await page.keyboard.press('Escape');
		await page.evaluate(() => { window.__holdFirstCompletion = false; });
		await checkbox.click();
		await page.waitForFunction((count) => window.__lspObserved?.filter((event) => event.direction === 'ui->worker' && event.method === 'initialize').length > count, offEvents.filter((event) => event.method === 'initialize' && event.direction === 'ui->worker').length, { timeout: 30000 });
		const initBeforeRestoreTyping = await page.evaluate(() => window.__lspObserved.filter((event) => event.direction === 'ui->worker' && event.method === 'initialize').length);
		const restoreAt = await page.evaluate(() => performance.now());
		await page.locator('.monaco-editor').first().click({ position: { x: 250, y: 160 } });
		await page.keyboard.press('Control+End');
		await page.keyboard.type('tr_', { delay: 30 });
		await page.waitForTimeout(1800);
		const restoreEvents = await page.evaluate(() => window.__lspObserved);
		const restoreChange = restoreEvents.filter((event) => event.direction === 'ui->worker' && event.method === 'textDocument/didChange' && event.at >= restoreAt).at(-1);
		const line = fixture.split('\n').length - 1;
		const restoreRequest = [...restoreEvents].reverse().find((event) => event.direction === 'ui->worker' && event.method === 'textDocument/completion' && event.params?.position?.line === line && event.params?.position?.character === 4 && event.at >= (restoreChange?.at ?? Infinity)) ?? null;
		const restoreResponse = restoreRequest ? restoreEvents.find((event) => event.direction === 'worker->ui' && event.id === restoreRequest.id) ?? null : null;
		cases.push(await snapshot(appContext, 'completion-off-no-retry', { inputAt, offAt, held, afterOffRequests, afterOffChanges, afterOffState, initBeforeRestoreTyping, restoreAt, restoreChangeVersion: restoreChange?.params?.textDocument?.version ?? null, restoreRequest, restoreResponse, restoreRows: (await visibleState(page)).rows }));
		await context.close();
	}

	// Version switch test: while unsupported 8.4 is selected, no new automatic request should survive; restoring 8.5 should recover.
	{
		const appContext = await openContext('version-84-no-retry-85-recovery');
		const { page, context } = appContext;
		await pasteFixture(page);
		const inputAt = await page.evaluate(() => performance.now());
		await page.keyboard.type('str_', { delay: 30 });
		await page.waitForTimeout(1500);
		await page.keyboard.press('Escape');
		const switchAt = await page.evaluate(() => performance.now());
		await page.locator('#select-php').click();
		await page.getByRole('option', { name: '8.4', exact: true }).click();
		await page.waitForTimeout(1500);
		const state84 = await visibleState(page);
		const events84 = await page.evaluate(() => window.__lspObserved);
		const requestsAfter84 = events84.filter((event) => event.direction === 'ui->worker' && event.method === 'textDocument/completion' && event.at >= switchAt);
		const initCount84 = events84.filter((event) => event.direction === 'ui->worker' && event.method === 'initialize').length;
		await page.locator('#select-php').click();
		await page.getByRole('option', { name: '8.5', exact: true }).click();
		await page.waitForFunction((count) => window.__lspObserved?.filter((event) => event.direction === 'ui->worker' && event.method === 'initialize').length > count, initCount84, { timeout: 30000 });
		await pasteFixture(page);
		const restoreAt = await page.evaluate(() => performance.now());
		await page.keyboard.type('str_', { delay: 30 });
		await page.waitForTimeout(1800);
		const restoreState = await visibleState(page);
		const restoreEvents = await page.evaluate(() => window.__lspObserved);
		const restoreChange = restoreEvents.filter((event) => event.direction === 'ui->worker' && event.method === 'textDocument/didChange' && event.at >= restoreAt).at(-1);
		const line = fixture.split('\n').length - 1;
		const restoreRequest = [...restoreEvents].reverse().find((event) => event.direction === 'ui->worker' && event.method === 'textDocument/completion' && event.params?.position?.line === line && event.params?.position?.character === 4 && event.at >= (restoreChange?.at ?? Infinity)) ?? null;
		const restoreResponse = restoreRequest ? restoreEvents.find((event) => event.direction === 'worker->ui' && event.id === restoreRequest.id) ?? null : null;
		cases.push(await snapshot(appContext, 'version-84-no-retry-85-recovery', { inputAt, switchAt, state84, requestsAfter84, initCount84, restoreAt, restoreChangeVersion: restoreChange?.params?.textDocument?.version ?? null, restoreRequest, restoreResponse, restoreState }));
		await context.close();
	}

	const output = { app, runId, sourceHead, sourceDirty: Boolean(sourceDirty), managerReadyRef, browser: browser.version(), phpVersionOnEntry: '8.5', fixture, method: 'natural typing and state transitions only; no Ctrl+Space. The checkbox-OFF case holds a Worker response inside the isolated page then drops it after observed Worker termination; it does not test product response-guard behavior.', cases, errors };
	await fs.writeFile(path.join(outDir, 'trace.json'), JSON.stringify(output, null, 2));
	console.log(JSON.stringify({ app, runId, sourceHead, managerReadyRef, cases: cases.map((entry) => ({ case: entry.case, phpVersion: entry.state?.version, rows: entry.state?.rows, requestId: entry.finalRequest?.id ?? entry.restoreRequest?.id ?? null, responseItemCount: entry.finalResponse?.result?.items?.length ?? entry.restoreResponse?.result?.items?.length ?? null, offRequests: entry.afterOffRequests?.length, requestsAfter84: entry.requestsAfter84?.length, workerEvents: entry.workerEvents })), errors }, null, 2));
} finally {
	await browser.close();
}
