import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const app = process.argv[2];
const expectedHead = process.argv[3];
const managerReadyRef = process.argv[4];
if (!['phpantom', 'phpactor'].includes(app) || !/^[0-9a-f]{40}$/i.test(expectedHead ?? '') || !managerReadyRef) {
	throw new Error('Usage: node measure-natural-completion.mjs <phpantom|phpactor> <manager-confirmed-source-head> <manager-ready-reference>');
}

const repoRoot = '/Users/glassmonkey/src/github.com/glassmonkey/php-playground';
const sourcePath = path.join(repoRoot, '..', 'php-playground-wt', app === 'phpactor' ? 'gla-115-lsp-phpactor-preview' : 'gla-115-lsp-preview');
const sourceHead = execFileSync('git', ['-C', sourcePath, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sourceDirty = execFileSync('git', ['-C', sourcePath, 'status', '--porcelain'], { encoding: 'utf8' }).trim();
if (sourceHead !== expectedHead || sourceDirty) {
	throw new Error(`Source identity mismatch or dirty worktree: expected=${expectedHead}, actual=${sourceHead}, dirty=${Boolean(sourceDirty)}`);
}

const require = createRequire(path.join(repoRoot, 'node_modules', 'playwright', 'package.json'));
const { chromium } = require('playwright');
const port = app === 'phpactor' ? 3471 : 7260;
const baseURL = `http://127.0.0.1:${port}/?v=8.5&f=html`;
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const outDir = path.resolve('docs/lsp/ui-evaluation/evidence', `${app}-natural-after-fix-${runId}`);
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
const fixture = await fs.readFile('docs/lsp/ui-evaluation/fixture.php', 'utf8');
const pageErrors = [];
const consoleErrors = [];
const scenarios = [
	{ name: 'str-underscore-slow', text: 'str_', delayMs: 160 },
	{ name: 'str-underscore-fast', text: 'str_', delayMs: 10 },
	{ name: 'strl-natural', text: 'strl', delayMs: 80 },
	{ name: 'variable-gre-natural', text: '$gre', delayMs: 80 },
	{ name: 'member-arrow-natural', text: '$greeter->', delayMs: 80 },
	{ name: 'class-static-natural', text: 'Greeter::', delayMs: 80 },
];
const runResults = [];

async function readWidgetState(page) {
	return page.evaluate(() => {
		const widget = document.querySelector('.suggest-widget');
		const style = widget ? getComputedStyle(widget) : null;
		const rect = widget?.getBoundingClientRect();
		const rows = [...(widget?.querySelectorAll('.monaco-list-row') ?? [])].map((row) => row.innerText);
		return { visible: Boolean(widget && rows.length && rect?.width > 0 && rect?.height > 0 && style?.display !== 'none' && style?.visibility !== 'hidden' && Number(style?.opacity ?? 1) > 0), rows };
	});
}

try {
	for (const scenario of scenarios) {
		const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
		await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL.slice(0, -1) });
		const page = await context.newPage();
		const assets = [];
		const completionTrace = [];
		page.on('pageerror', (error) => pageErrors.push({ scenario: scenario.name, message: error.message }));
		page.on('console', async (message) => {
			if (message.type() === 'error') consoleErrors.push({ scenario: scenario.name, message: message.text() });
			if (message.type() === 'info' && message.text().includes('[phpactor-lsp]')) completionTrace.push({ text: message.text(), values: await Promise.all(message.args().map((arg) => arg.jsonValue().catch(() => null))) });
		});
		page.on('response', async (response) => {
			if (!['script', 'stylesheet'].includes(response.request().resourceType())) return;
			try {
				const body = await response.body();
				const headers = await response.allHeaders();
				assets.push({ url: response.url(), status: response.status(), etag: headers.etag ?? null, lastModified: headers['last-modified'] ?? null, contentLength: body.length, sha256: createHash('sha256').update(body).digest('hex') });
			} catch (error) {
				assets.push({ url: response.url(), status: response.status(), readError: error.message });
			}
		});
		await page.addInitScript(() => {
			if (location.port === '3471') localStorage.setItem('phpactorLspTrace', '1');
			window.__lspObserved = [];
			window.__suggestSnapshots = [];
			window.__workerUrls = [];
			const captureSuggest = () => {
				const widget = document.querySelector('.suggest-widget');
				const style = widget ? getComputedStyle(widget) : null;
				const rect = widget?.getBoundingClientRect();
				const rows = [...(widget?.querySelectorAll('.monaco-list-row') ?? [])].map((row) => row.innerText);
				const visible = Boolean(widget && rows.length && rect?.width > 0 && rect?.height > 0 && style?.display !== 'none' && style?.visibility !== 'hidden' && Number(style?.opacity ?? 1) > 0);
				const snapshot = { at: performance.now(), visible, rows, rect: rect ? { width: rect.width, height: rect.height } : null, style: style ? { display: style.display, visibility: style.visibility, opacity: style.opacity } : null };
				const previous = window.__suggestSnapshots.at(-1);
				if (!previous || previous.visible !== snapshot.visible || JSON.stringify(previous.rows) !== JSON.stringify(snapshot.rows)) window.__suggestSnapshots.push(snapshot);
			};
			const observer = new MutationObserver(() => requestAnimationFrame(captureSuggest));
			observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true, attributeFilter: ['class', 'style', 'aria-hidden'] });
			const NativeWorker = window.Worker;
			window.Worker = class extends NativeWorker {
				constructor(...args) {
					super(...args);
					window.__workerUrls.push(String(args[0]));
					this.addEventListener('message', (event) => {
						const data = event.data;
						if (data?.jsonrpc === '2.0' && (data.id !== undefined || data.method?.startsWith('textDocument/'))) window.__lspObserved.push({ direction: 'worker->ui', at: performance.now(), id: data.id, method: data.method, result: data.result, error: data.error });
					});
				}
				postMessage(data, ...args) {
					if (data?.jsonrpc === '2.0' && (data.id !== undefined || data.method?.startsWith('textDocument/'))) window.__lspObserved.push({ direction: 'ui->worker', at: performance.now(), id: data.id, method: data.method, params: data.params });
					return super.postMessage(data, ...args);
				}
			};
		});

		await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
		await page.locator('.monaco-editor .view-lines').waitFor({ timeout: 30000 });
		const checkbox = page.getByTestId('checkbox-completion');
		if (!(await checkbox.isChecked().catch(() => false))) await checkbox.click();
		await page.waitForFunction(() => window.__lspObserved?.some((event) => event.direction === 'ui->worker' && event.method === 'initialize') && window.__lspObserved?.some((event) => event.direction === 'worker->ui' && event.result?.capabilities), undefined, { timeout: 30000 });
		const editor = page.locator('.monaco-editor').first();
		const pasteStartedAt = await page.evaluate(() => performance.now());
		await page.evaluate((text) => navigator.clipboard.writeText(text), fixture);
		await editor.click({ position: { x: 250, y: 160 } });
		await page.keyboard.press('Meta+A');
		await page.keyboard.press('Meta+V');
		await page.waitForFunction(({ text, at }) => window.__lspObserved?.some((event) => event.direction === 'ui->worker' && event.at >= at && event.method === 'textDocument/didChange' && event.params?.contentChanges?.some((change) => change.text === text)), { text: fixture, at: pasteStartedAt }, { timeout: 5000 });
		await page.keyboard.press('Control+End');
		const baselineChange = await page.evaluate((at) => [...window.__lspObserved].reverse().find((event) => event.direction === 'ui->worker' && event.at >= at && event.method === 'textDocument/didChange'), pasteStartedAt);
		const inputAt = await page.evaluate(() => performance.now());
		await page.keyboard.type(scenario.text, { delay: scenario.delayMs });
		const typedAt = await page.evaluate(() => performance.now());
		const expectedPosition = { line: fixture.split('\n').length - 1, character: scenario.text.length };
		const pauseMs = 1800;
		await page.waitForTimeout(Math.max(0, typedAt + pauseMs - (await page.evaluate(() => performance.now()))));
		const eventsAtPause = await page.evaluate(() => window.__lspObserved);
		const changesAtPause = eventsAtPause.filter((event) => event.direction === 'ui->worker' && event.method === 'textDocument/didChange' && event.at >= inputAt);
		const lastChangeAtPause = changesAtPause.at(-1) ?? null;
		const requestAtPause = [...eventsAtPause].reverse().find((event) => event.direction === 'ui->worker' && event.method === 'textDocument/completion' && event.at >= (lastChangeAtPause?.at ?? Infinity) && event.params?.position?.line === expectedPosition.line && event.params?.position?.character === expectedPosition.character) ?? null;
		const stateAtPause = await readWidgetState(page);
		const pauseScreenshot = `${scenario.name}-at-1800ms.png`;
		await page.screenshot({ path: path.join(outDir, pauseScreenshot) });
		await page.waitForFunction(({ startedAt, position }) => {
			const events = window.__lspObserved ?? [];
			const latestChange = events.filter((event) => event.direction === 'ui->worker' && event.method === 'textDocument/didChange' && event.at >= startedAt).at(-1);
			if (!latestChange) return false;
			const latestRequest = [...events].reverse().find((event) => event.direction === 'ui->worker' && event.method === 'textDocument/completion' && event.at >= latestChange.at && event.params?.position?.line === position.line && event.params?.position?.character === position.character);
			return Boolean(latestRequest && events.some((event) => event.direction === 'worker->ui' && event.id === latestRequest.id));
		}, { startedAt: inputAt, position: expectedPosition }, { timeout: 12000 }).catch(() => {});
		await page.waitForTimeout(100);
		const observed = await page.evaluate(() => ({ events: window.__lspObserved, snapshots: window.__suggestSnapshots, workerUrls: window.__workerUrls }));
		const changes = observed.events.filter((event) => event.direction === 'ui->worker' && event.method === 'textDocument/didChange' && event.at >= inputAt);
		const completionRequests = observed.events.filter((event) => event.direction === 'ui->worker' && event.method === 'textDocument/completion' && event.at >= inputAt);
		const finalChange = changes.at(-1) ?? null;
		const finalRequest = [...completionRequests].reverse().find((event) => event.params?.position?.line === expectedPosition.line && event.params?.position?.character === expectedPosition.character && (!finalChange || event.at >= finalChange.at)) ?? null;
		const finalResponse = finalRequest ? observed.events.find((event) => event.direction === 'worker->ui' && event.id === finalRequest.id) ?? null : null;
		const finalState = await page.evaluate(() => {
			const widget = document.querySelector('.suggest-widget');
			const style = widget ? getComputedStyle(widget) : null;
			const rect = widget?.getBoundingClientRect();
			const rows = [...(widget?.querySelectorAll('.monaco-list-row') ?? [])].map((row) => row.innerText);
			return {
				editorText: document.querySelector('.monaco-editor .view-lines')?.innerText?.replaceAll('\u00a0', ' ') ?? null,
				activeElement: document.activeElement ? { tag: document.activeElement.tagName, className: document.activeElement.className?.toString?.() ?? '' } : null,
				phpVersion: document.querySelector('[class*="singleValue"]')?.innerText ?? null,
				completionChecked: document.querySelector('[data-testid="checkbox-completion"] input')?.checked ?? null,
				suggest: { visible: Boolean(widget && rows.length && rect?.width > 0 && rect?.height > 0 && style?.display !== 'none' && style?.visibility !== 'hidden' && Number(style?.opacity ?? 1) > 0), rows },
				cursor: (() => { const cursor = document.querySelector('.monaco-editor .cursors-layer .cursor'); const cursorRect = cursor?.getBoundingClientRect(); return cursorRect ? { left: cursorRect.left, top: cursorRect.top, width: cursorRect.width, height: cursorRect.height, visibility: getComputedStyle(cursor).visibility } : null; })(),
			};
		});
		const screenshot = `${scenario.name}.png`;
		await page.screenshot({ path: path.join(outDir, `${scenario.name}.png`) });
		const result = {
			name: scenario.name,
			typedText: scenario.text,
			inputSpeedMsPerCharacter: scenario.delayMs,
			pauseAfterTypingMs: pauseMs,
			inputAt,
			typedAt,
			pauseSampleAt: typedAt + pauseMs,
			fullTextExpected: fixture + scenario.text,
			expectedPosition,
			baselineVersion: baselineChange?.params?.textDocument?.version ?? null,
			versionsDuringInput: changesAtPause.map((event) => ({ at: event.at, version: event.params?.textDocument?.version ?? null, contentChanges: event.params?.contentChanges ?? [] })),
			versionAtPause: lastChangeAtPause?.params?.textDocument?.version ?? null,
			requestAtPause,
			rowsVisibleAtPause: stateAtPause.rows,
			visibleAtPause: stateAtPause.visible,
			pauseScreenshot,
			completionRequests,
			finalRequest,
			finalResponse,
			finalDocumentVersion: finalChange?.params?.textDocument?.version ?? null,
			rowsAfterLatestResponse: finalState.suggest.rows,
			visibleAfterLatestResponse: finalState.suggest.visible,
			visibleSnapshotsAfterInput: observed.snapshots.filter((snapshot) => snapshot.at >= inputAt && snapshot.visible),
			finalState,
			requestAfterLatestInputChange: Boolean(finalRequest && finalChange && finalRequest.at >= finalChange.at),
			screenshot,
		};
		runResults.push(result);
		await fs.writeFile(path.join(outDir, `${scenario.name}-trace.json`), JSON.stringify({ app, runId, sourceHead, sourceDirty: Boolean(sourceDirty), managerReadyRef, url: baseURL, browser: browser.version(), phpVersion: finalState.phpVersion, fixture, scenario: result, assets, completionTrace, lspEvents: observed.events, suggestSnapshots: observed.snapshots, workerUrls: observed.workerUrls, pageErrors: pageErrors.filter((entry) => entry.scenario === scenario.name), consoleErrors: consoleErrors.filter((entry) => entry.scenario === scenario.name) }, null, 2));
		await context.close();
	}
	const output = { app, runId, sourceHead, managerReadyRef, url: baseURL, browser: browser.version(), viewport: { width: 1440, height: 1000 }, fixture, inputMethod: 'Natural Playwright keyboard typing only; no Ctrl+Space or other completion invocation in measured cases', timing: 'UI snapshots use MutationObserver followed by requestAnimationFrame and DOM/style visibility; this does not guarantee physical paint completion.', results: runResults, pageErrors, consoleErrors };
	await fs.writeFile(path.join(outDir, 'trace.json'), JSON.stringify(output, null, 2));
	console.log(JSON.stringify({ app, runId, sourceHead, managerReadyRef, phpVersion: runResults[0]?.finalState.phpVersion, results: runResults.map(({ name, inputSpeedMsPerCharacter, baselineVersion, versionsDuringInput, requestAtPause, visibleAtPause, rowsVisibleAtPause, finalRequest, finalResponse, visibleAfterLatestResponse, rowsAfterLatestResponse, requestAfterLatestInputChange }) => ({ name, inputSpeedMsPerCharacter, baselineVersion, inputVersions: versionsDuringInput.map((entry) => entry.version), requestAtPauseId: requestAtPause?.id ?? null, visibleAtPause, rowsVisibleAtPause, latestRequestId: finalRequest?.id ?? null, requestPosition: finalRequest?.params?.position ?? null, responseItems: finalResponse?.result?.items?.length ?? null, visibleAfterLatestResponse, rowsAfterLatestResponse, requestAfterLatestInputChange })), pageErrors, consoleErrors }, null, 2));
} finally {
	await browser.close();
}
