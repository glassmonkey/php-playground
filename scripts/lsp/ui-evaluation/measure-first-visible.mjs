import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire('/Users/glassmonkey/src/github.com/glassmonkey/php-playground/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const app = process.argv[2] ?? 'phpantom';
if (!['phpantom', 'phpactor'].includes(app)) throw new Error(`Unknown app: ${app}`);
const baseURL = `http://127.0.0.1:${app === 'phpactor' ? 3471 : 7260}/?v=8.5&f=html`;
const outRoot = path.resolve('docs/lsp/ui-evaluation/evidence');
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const outDir = path.join(outRoot, `${app}-first-visible-${runId}`);
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
const fixture = await fs.readFile('docs/lsp/ui-evaluation/fixture.php', 'utf8');
const fixtureBase = fixture.replace(/\n\$number = 1;\n$/, '\n$number = 1;');
const results = [];
const pageErrors = [];

for (const scenario of [
	{ name: 'member-arrow', prefix: '\n$greeter', typed: '->' },
	{ name: 'builtin-strl', prefix: '\nstr', typed: 'l' },
]) {
	const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
	const page = await context.newPage();
	page.on('pageerror', (error) => pageErrors.push({ scenario: scenario.name, error: error.message }));
	await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL.slice(0, -1) });
	await page.addInitScript(() => {
		window.__lspObserved = [];
		window.__candidateMeasure = null;
		const scan = () => {
			const measure = window.__candidateMeasure;
			if (!measure || measure.visibleAt !== null) return;
			const widget = document.querySelector('.suggest-widget');
			const rows = [...(widget?.querySelectorAll('.monaco-list-row') ?? [])];
			const style = widget ? getComputedStyle(widget) : null;
			const rect = widget?.getBoundingClientRect();
			const qualifies = Boolean(widget && rows.length && rect?.width > 0 && rect?.height > 0 && style?.display !== 'none' && style?.visibility !== 'hidden' && Number(style?.opacity ?? 1) > 0);
			if (qualifies) {
				measure.visibleAt = performance.now();
				measure.rowsAtFirstVisible = rows.map((row) => row.innerText);
				measure.visibleCriteria = { rowCount: rows.length, width: rect.width, height: rect.height, display: style.display, visibility: style.visibility, opacity: style.opacity };
			}
		};
		let scheduled = false;
		const observer = new MutationObserver(() => {
			if (scheduled) return;
			scheduled = true;
			requestAnimationFrame(() => { scheduled = false; scan(); });
		});
		observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true, attributeFilter: ['class', 'style', 'aria-hidden'] });
		const NativeWorker = window.Worker;
		window.Worker = class extends NativeWorker {
			constructor(...args) {
				super(...args);
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
	await page.waitForFunction(() => window.__lspObserved?.some((e) => e.method === 'initialize' && e.direction === 'ui->worker') && window.__lspObserved?.some((e) => e.direction === 'worker->ui' && e.result?.capabilities), undefined, { timeout: 30000 });
	const editor = page.locator('.monaco-editor').first();
	const baseCode = fixtureBase + scenario.prefix;
	const scenarioResults = [];
	for (let round = 1; round <= 3; round++) {
		await page.keyboard.press('Escape');
		const baseChangeStartedAt = await page.evaluate(() => performance.now());
		await page.evaluate((value) => navigator.clipboard.writeText(value), baseCode);
		await editor.click({ position: { x: 250, y: 160 } });
		await page.keyboard.press('Meta+A');
		await page.keyboard.press('Meta+V');
		await page.waitForFunction(({ value, startedAt }) => window.__lspObserved?.some((e) => e.at >= startedAt && e.method === 'textDocument/didChange' && e.params?.contentChanges?.some((c) => c.text === value)), { value: baseCode, startedAt: baseChangeStartedAt }, { timeout: 5000 });
		await page.keyboard.press('Control+End');
		const typedText = baseCode + scenario.typed;
		const trialId = `${scenario.name}-r${round}`;
		const inputAt = await page.evaluate((id) => {
			window.__candidateMeasure = { id, inputAt: performance.now(), expectedText: null, visibleAt: null, rowsAtFirstVisible: null, visibleCriteria: null };
			return window.__candidateMeasure.inputAt;
		}, trialId);
		await page.keyboard.type(scenario.typed, { delay: 80 });
		await page.evaluate((text) => { window.__candidateMeasure.expectedText = text; }, typedText);
		await page.waitForFunction(({ text, startedAt }) => window.__lspObserved?.some((e) => e.at >= startedAt && e.method === 'textDocument/didChange' && e.params?.contentChanges?.some((c) => c.text === text)), { text: typedText, startedAt: inputAt }, { timeout: 5000 });
		const changes = await page.evaluate(({ text, startedAt }) => window.__lspObserved.filter((e) => e.direction === 'ui->worker' && e.at >= startedAt && e.method === 'textDocument/didChange' && e.params?.contentChanges?.some((c) => c.text === text)), { text: typedText, startedAt: inputAt });
		const change = changes.at(-1);
		const position = { line: typedText.split('\n').length - 1, character: typedText.split('\n').at(-1).length };
		await page.waitForFunction(({ at, pos }) => window.__lspObserved?.some((e) => e.direction === 'ui->worker' && e.method === 'textDocument/completion' && e.at >= at && e.params?.position?.line === pos.line && e.params?.position?.character === pos.character), { at: inputAt, pos: position }, { timeout: 8000 }).catch(() => {});
		const events = await page.evaluate(() => window.__lspObserved);
		const request = [...events].reverse().find((e) => e.direction === 'ui->worker' && e.method === 'textDocument/completion' && e.at >= inputAt && e.params?.position?.line === position.line && e.params?.position?.character === position.character);
		if (request) await page.waitForFunction((id) => window.__lspObserved?.some((e) => e.direction === 'worker->ui' && e.id === id), request.id, { timeout: 15000 }).catch(() => {});
		await page.waitForFunction((id) => window.__candidateMeasure?.id === id && window.__candidateMeasure.visibleAt !== null, trialId, { timeout: 10000 }).catch(() => {});
		const finalEvents = await page.evaluate(() => window.__lspObserved);
		const response = request && finalEvents.find((e) => e.direction === 'worker->ui' && e.id === request.id);
		const firstVisible = await page.evaluate(() => window.__candidateMeasure);
		const screenshot = `${app}-${trialId}.png`;
		await page.screenshot({ path: path.join(outDir, screenshot) });
		const latestChangeBeforeRequest = request && finalEvents.filter((e) => e.direction === 'ui->worker' && e.method === 'textDocument/didChange' && e.at <= request.at).at(-1);
		const trialResult = { scenario: scenario.name, round, cacheLabel: round === 1 ? 'first-request-after-initialize' : 'same-worker-repeat', trialId, inputAt, typedAt: inputAt, typedText, expectedPosition: position, documentVersion: change?.params?.textDocument?.version ?? null, changeAt: change?.at ?? null, requestAt: request?.at ?? null, requestId: request?.id ?? null, requestPosition: request?.params?.position ?? null, responseAt: response?.at ?? null, rpcRoundTripMs: request && response ? response.at - request.at : null, firstVisibleAt: firstVisible?.visibleAt ?? null, inputToRequestMs: request ? request.at - inputAt : null, inputToFirstDomVisibleMs: firstVisible?.visibleAt !== null && firstVisible?.visibleAt !== undefined ? firstVisible.visibleAt - inputAt : null, requestToFirstDomVisibleMs: request && firstVisible?.visibleAt !== null && firstVisible?.visibleAt !== undefined ? firstVisible.visibleAt - request.at : null, visibleCriteria: firstVisible?.visibleCriteria ?? null, rowsAtFirstVisible: firstVisible?.rowsAtFirstVisible ?? [], responseBeforeFirstVisible: Boolean(response && firstVisible?.visibleAt && response.at <= firstVisible.visibleAt), orderValid: Boolean(change && request && latestChangeBeforeRequest?.params?.textDocument?.version === change.params.textDocument.version && latestChangeBeforeRequest?.params?.contentChanges?.some((c) => c.text === typedText) && request.params.position.line === position.line && request.params.position.character === position.character), screenshot };
		results.push(trialResult);
		scenarioResults.push(trialResult);
		await page.keyboard.press('Escape');
	}
	const rpc = await page.evaluate(() => window.__lspObserved);
	const caseResult = { scenario: scenario.name, app, runId, url: baseURL, browser: browser.version(), phpVersion: await page.locator('[class*="singleValue"]').innerText().catch(() => null), fixture, initialState: 'new isolated BrowserContext; first request after initialize is labeled first-request-after-initialize; subsequent repetitions reuse that worker', results: scenarioResults, lspEvents: rpc, pageErrors: pageErrors.filter((e) => e.scenario === scenario.name) };
	await fs.writeFile(path.join(outDir, `${scenario.name}-trace.json`), JSON.stringify(caseResult, null, 2));
	await context.close();
}

await fs.writeFile(path.join(outDir, 'trace.json'), JSON.stringify({ app, runId, browser: browser.version(), phpVersion: '8.5 selected per isolated context', timingDefinition: 'Input-to-first-DOM-visible is measured from immediately before Playwright key input to first requestAnimationFrame sample with suggest widget rect, nonempty rows, display not none, visibility not hidden, opacity > 0. This is DOM/style visibility sampling, not a guarantee of physical paint completion.', cases: results, pageErrors }, null, 2));
console.log(JSON.stringify({ app, runId, browser: browser.version(), cases: ['member-arrow', 'builtin-strl'].map((scenario) => ({ scenario, trials: results.filter((r) => r.scenario === scenario).map(({ round, cacheLabel, documentVersion, requestPosition, orderValid, rpcRoundTripMs, inputToRequestMs, inputToFirstDomVisibleMs, requestToFirstDomVisibleMs, rowsAtFirstVisible, responseBeforeFirstVisible }) => ({ round, cacheLabel, documentVersion, requestPosition, orderValid, rpcRoundTripMs, inputToRequestMs, inputToFirstDomVisibleMs, requestToFirstDomVisibleMs, rowsAtFirstVisible, responseBeforeFirstVisible })) })), pageErrors }, null, 2));
await browser.close();
