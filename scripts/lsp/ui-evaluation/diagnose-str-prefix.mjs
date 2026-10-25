import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire('/Users/glassmonkey/src/github.com/glassmonkey/php-playground/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const app = process.argv[2] ?? 'phpantom';
if (!['phpantom', 'phpactor'].includes(app)) throw new Error(`Unknown app: ${app}`);
const port = app === 'phpactor' ? 3471 : 7260;
const baseURL = `http://127.0.0.1:${port}/?v=8.5&f=html`;
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const outDir = path.resolve('docs/lsp/ui-evaluation/evidence', `${app}-str-prefix-${runId}`);
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
const page = await context.newPage();
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL.slice(0, -1) });
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
await page.addInitScript(() => {
	window.__lspObserved = [];
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

const fixture = await fs.readFile('docs/lsp/ui-evaluation/fixture.php', 'utf8');
const fixtureBase = fixture.replace(/\n\$number = 1;\n$/, '\n$number = 1;');
await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
await page.locator('.monaco-editor .view-lines').waitFor({ timeout: 30000 });
const checkbox = page.getByTestId('checkbox-completion');
if (!(await checkbox.isChecked().catch(() => false))) await checkbox.click();
await page.waitForFunction(() => window.__lspObserved?.some((e) => e.method === 'initialize' && e.direction === 'ui->worker') && window.__lspObserved?.some((e) => e.direction === 'worker->ui' && e.result?.capabilities), undefined, { timeout: 30000 });
const editor = page.locator('.monaco-editor').first();

async function replaceCode(code) {
	const startedAt = await page.evaluate(() => performance.now());
	await page.evaluate((value) => navigator.clipboard.writeText(value), code);
	await editor.click({ position: { x: 250, y: 160 } });
	await page.keyboard.press('Meta+A');
	await page.keyboard.press('Meta+V');
	await page.waitForFunction(({ code, startedAt }) => window.__lspObserved?.some((e) => e.at >= startedAt && e.method === 'textDocument/didChange' && e.params?.contentChanges?.some((c) => c.text === code)), { code, startedAt }, { timeout: 5000 });
	await page.keyboard.press('Control+End');
	return page.evaluate(({ code, startedAt }) => [...window.__lspObserved].reverse().find((e) => e.at >= startedAt && e.method === 'textDocument/didChange' && e.params?.contentChanges?.some((c) => c.text === code)), { code, startedAt });
}
async function state() {
	return page.evaluate(() => {
		const widget = document.querySelector('.suggest-widget');
		return {
			editorText: document.querySelector('.monaco-editor .view-lines')?.innerText ?? null,
			activeElement: document.activeElement ? { tag: document.activeElement.tagName, className: document.activeElement.className?.toString?.() ?? '' } : null,
			phpVersion: document.querySelector('[class*="singleValue"]')?.innerText ?? null,
			completionChecked: document.querySelector('[data-testid="checkbox-completion"] input')?.checked ?? null,
			suggest: widget ? { visible: Boolean(widget.getClientRects().length && getComputedStyle(widget).display !== 'none' && getComputedStyle(widget).visibility !== 'hidden'), rows: [...widget.querySelectorAll('.monaco-list-row')].map((r) => r.innerText) } : null,
		};
	});
}
async function measure(name, prefix, typed, mode) {
	await page.keyboard.press('Escape');
	const code = fixtureBase + prefix;
	const baseChange = await replaceCode(code);
	const fullText = code + typed;
	const position = { line: fullText.split('\n').length - 1, character: fullText.split('\n').at(-1).length };
	const startedAt = await page.evaluate(() => performance.now());
	if (mode === 'auto') {
		await page.keyboard.type(typed, { delay: 80 });
		await page.waitForFunction(({ fullText, startedAt }) => window.__lspObserved?.some((e) => e.at >= startedAt && e.method === 'textDocument/didChange' && e.params?.contentChanges?.some((c) => c.text === fullText)), { fullText, startedAt }, { timeout: 5000 });
	} else {
		await page.keyboard.press('Control+Space');
	}
	await page.waitForFunction(({ startedAt, position }) => window.__lspObserved?.some((e) => e.direction === 'ui->worker' && e.method === 'textDocument/completion' && e.at >= startedAt && e.params?.position?.line === position.line && e.params?.position?.character === position.character), { startedAt, position }, { timeout: mode === 'auto' ? 2000 : 5000 }).catch(() => {});
	const events = await page.evaluate(() => window.__lspObserved);
	const currentChange = mode === 'auto'
		? events.filter((e) => e.direction === 'ui->worker' && e.method === 'textDocument/didChange' && e.at >= startedAt && e.params?.contentChanges?.some((c) => c.text === fullText)).at(-1)
		: baseChange;
	const request = events.filter((e) => e.direction === 'ui->worker' && e.method === 'textDocument/completion' && e.at >= startedAt && e.params?.position?.line === position.line && e.params?.position?.character === position.character).at(-1) ?? null;
	if (mode === 'manual' && !request) throw new Error(`No manual completion request for ${name}`);
	if (request) await page.waitForFunction((id) => window.__lspObserved?.some((e) => e.direction === 'worker->ui' && e.id === id), request.id, { timeout: 15000 }).catch(() => {});
	if (request) await page.waitForTimeout(200);
	else await page.waitForTimeout(Math.max(0, 1500 - (await page.evaluate(() => performance.now()) - startedAt)));
	const finalEvents = await page.evaluate(() => window.__lspObserved);
	const response = request && finalEvents.find((e) => e.direction === 'worker->ui' && e.id === request.id);
	const suggestionState = await state();
	const screenshot = `${name}.png`;
	await page.screenshot({ path: path.join(outDir, screenshot) });
	const latestChangeBeforeRequest = request && finalEvents.filter((e) => e.direction === 'ui->worker' && e.method === 'textDocument/didChange' && e.at <= request.at).at(-1);
	const result = { name, prefix: code.split('\n').at(-1), typed, mode, fullText, baseVersion: baseChange?.params?.textDocument?.version ?? null, changeVersion: currentChange?.params?.textDocument?.version ?? null, changeAt: currentChange?.at ?? null, expectedPosition: position, request, response, rawResult: response?.result ?? null, visibleRows: suggestionState.suggest?.rows ?? [], suggestionVisible: suggestionState.suggest?.visible ?? false, state: suggestionState, orderValid: Boolean(currentChange && request && latestChangeBeforeRequest?.params?.textDocument?.version === currentChange.params.textDocument.version && latestChangeBeforeRequest?.params?.contentChanges?.some((c) => c.text === fullText) && request.params.position.line === position.line && request.params.position.character === position.character), screenshot };
	await page.keyboard.press('Escape');
	return result;
}

const results = [];
results.push(await measure('manual-str-underscore', '\nstr_', '', 'manual'));
results.push(await measure('auto-str-underscore', '\nstr', '_', 'auto'));
results.push(await measure('manual-strl', '\nstrl', '', 'manual'));
results.push(await measure('auto-strl', '\nstr', 'l', 'auto'));
const output = { app, runId, url: baseURL, browser: browser.version(), phpVersion: await page.locator('[class*="singleValue"]').innerText().catch(() => null), viewport: { width: 1440, height: 1000 }, fixture, inputSpeed: 'Playwright keyboard.type delay=80ms per naturally typed character; manual Ctrl+Space uses the same exact prefix after full document synchronization', methods: 'Worker request/response postMessage capture; screen rows from Monaco suggest widget after request/settle window', results, allEvents: await page.evaluate(() => window.__lspObserved), pageErrors, consoleErrors };
await fs.writeFile(path.join(outDir, 'trace.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify({ app, runId, phpVersion: output.phpVersion, results: results.map((r) => ({ name: r.name, mode: r.mode, baseVersion: r.baseVersion, changeVersion: r.changeVersion, request: r.request && { id: r.request.id, position: r.request.params.position }, orderValid: r.orderValid, rawItems: Array.isArray(r.rawResult) ? r.rawResult : r.rawResult?.items, visibleRows: r.visibleRows, suggestionVisible: r.suggestionVisible })), pageErrors, consoleErrors }, null, 2));
await context.close();
await browser.close();
