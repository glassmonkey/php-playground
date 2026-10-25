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
const outDir = path.join(outRoot, `${app}-hover-${runId}`);
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
	headless: true,
	executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	args: ['--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
const page = await context.newPage();
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL.slice(0, -1) });
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
await page.addInitScript(() => {
	window.__lspObserved = [];
	window.__hoverDom = [];
	const observer = new MutationObserver((records) => {
		for (const record of records) {
			const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
			const hover = target?.closest?.('.monaco-hover');
			if (!hover && !target?.className?.toString?.().includes('hover')) continue;
			window.__hoverDom.push({ at: performance.now(), className: target?.className?.toString?.() ?? '', hoverText: hover?.innerText ?? target?.innerText ?? '', hoverVisible: Boolean(hover && hover.getClientRects().length && getComputedStyle(hover).visibility !== 'hidden') });
		}
	});
	observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true, attributeFilter: ['class', 'style', 'aria-hidden'] });
	const NativeWorker = window.Worker;
	window.Worker = class extends NativeWorker {
		constructor(...args) {
			super(...args);
			this.addEventListener('message', (event) => {
				const data = event.data;
				if (data?.jsonrpc === '2.0' && (data.id !== undefined || data.method?.startsWith('textDocument/'))) window.__lspObserved.push({ direction: 'worker->ui', at: performance.now(), id: data.id, method: data.method, params: data.params, result: data.result, error: data.error });
			});
		}
		postMessage(data, ...args) {
			if (data?.jsonrpc === '2.0' && (data.id !== undefined || data.method?.startsWith('textDocument/'))) window.__lspObserved.push({ direction: 'ui->worker', at: performance.now(), id: data.id, method: data.method, params: data.params });
			return super.postMessage(data, ...args);
		}
	};
});

const fixture = await fs.readFile('docs/lsp/ui-evaluation/fixture.php', 'utf8');
const startedAt = new Date().toISOString();
await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
await page.locator('.monaco-editor .view-lines').waitFor({ timeout: 30000 });
const completion = page.getByTestId('checkbox-completion');
if (!(await completion.isChecked().catch(() => false))) await completion.click();
await page.waitForFunction(() => window.__lspObserved?.some((e) => e.method === 'initialize' && e.direction === 'ui->worker') && window.__lspObserved?.some((e) => e.direction === 'worker->ui' && e.result?.capabilities), { timeout: 30000 });
const editor = page.locator('.monaco-editor').first();
await page.evaluate((value) => navigator.clipboard.writeText(value), fixture);
await editor.click({ position: { x: 250, y: 160 } });
await page.keyboard.press('Meta+A');
await page.keyboard.press('Meta+V');
await page.waitForFunction((value) => window.__lspObserved?.some((e) => e.method === 'textDocument/didChange' && e.params?.contentChanges?.some((c) => c.text === value)), fixture, { timeout: 5000 });
await page.keyboard.press('Control+End');
await page.waitForTimeout(300);

async function viewSnapshot() {
	return page.evaluate(() => {
		const hover = document.querySelector('.monaco-editor .monaco-hover');
		const active = document.activeElement;
		const cursor = document.querySelector('.monaco-editor .cursors-layer .cursor');
		const version = document.querySelector('[class*="singleValue"]');
		return {
			visibleText: document.querySelector('.monaco-editor .view-lines')?.innerText ?? null,
			activeElement: active ? { tag: active.tagName, className: active.className?.toString?.() ?? '', ariaLabel: active.getAttribute('aria-label') } : null,
			cursorStyle: cursor?.getAttribute('style') ?? null,
			phpVersion: version?.innerText ?? null,
			completionChecked: document.querySelector('[data-testid="checkbox-completion"] input')?.checked ?? null,
			hover: hover ? { className: hover.className, text: hover.innerText, visible: Boolean(hover.getClientRects().length && getComputedStyle(hover).visibility !== 'hidden'), rect: hover.getBoundingClientRect().toJSON() } : null,
		};
	});
}

async function operation(name, run) {
	const before = await page.evaluate(() => performance.now());
	await run();
	await page.waitForFunction((at) => window.__lspObserved?.some((e) => e.direction === 'ui->worker' && e.method === 'textDocument/hover' && e.at >= at), before, { timeout: 5000 }).catch(() => {});
	const eventsNow = await page.evaluate(() => window.__lspObserved ?? []);
	const request = [...eventsNow].reverse().find((e) => e.direction === 'ui->worker' && e.method === 'textDocument/hover' && e.at >= before);
	if (request) await page.waitForFunction((id) => window.__lspObserved?.some((e) => e.direction === 'worker->ui' && e.id === id), request.id, { timeout: 15000 }).catch(() => {});
	const eventsAfter = await page.evaluate(() => window.__lspObserved ?? []);
	const response = request && eventsAfter.find((e) => e.direction === 'worker->ui' && e.id === request.id);
	await page.waitForTimeout(1200);
	const state = await viewSnapshot();
	const mutations = await page.evaluate(() => window.__hoverDom ?? []);
	const screenshot = `${name}.png`;
	await page.screenshot({ path: path.join(outDir, screenshot) });
	return { name, startedAt: before, request, response, requestToResponseMs: request && response ? response.at - request.at : null, state, hoverMutationsAfterStart: mutations.filter((m) => m.at >= before), screenshot };
}

const symbolLine = page.locator('.view-line').filter({ hasText: '$greeter = new Greeter' }).last();
const symbolText = await symbolLine.innerText();
const box = await symbolLine.boundingBox();
const pointerTarget = box ? { x: box.x + 24, y: box.y + box.height / 2 } : null;
const pointer = await operation('pointer-hover', async () => {
	if (!pointerTarget) throw new Error('Could not locate the $greeter source line');
	await page.mouse.move(5, 5);
	await page.waitForTimeout(100);
	await page.mouse.move(pointerTarget.x, pointerTarget.y);
});

await page.keyboard.press('Escape');
await page.evaluate((value) => navigator.clipboard.writeText(value), fixture);
await editor.click({ position: { x: 250, y: 160 } });
await page.keyboard.press('Meta+A');
await page.keyboard.press('Meta+V');
await page.waitForFunction((value) => window.__lspObserved?.some((e) => e.method === 'textDocument/didChange' && e.params?.contentChanges?.some((c) => c.text === value)), fixture, { timeout: 5000 });
await page.keyboard.press('Control+End');
await page.waitForTimeout(300);
const keyboardLine = page.locator('.view-line').filter({ hasText: '$greeter = new Greeter' }).last();
const keyboardBox = await keyboardLine.boundingBox();
await page.mouse.move(5, 5);
await page.waitForTimeout(200);
const keyboard = await operation('keyboard-hover', async () => {
	if (!keyboardBox) throw new Error('Could not locate the $greeter source line');
	await page.mouse.click(keyboardBox.x + 24, keyboardBox.y + keyboardBox.height / 2);
	await page.keyboard.press('Meta+K');
	await page.keyboard.press('Meta+I');
});

const result = { app, runId, startedAt, url: page.url(), browser: browser.version(), phpVersion: await page.locator('[class*="singleValue"]').innerText().catch(() => null), fixture, symbolLine: symbolText, pointerTarget, pointer, keyboard, pageErrors, consoleErrors, allEvents: await page.evaluate(() => window.__lspObserved ?? []) };
await fs.writeFile(path.join(outDir, 'trace.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ app, runId, browser: result.browser, phpVersion: result.phpVersion, symbolLine, pointer: { request: pointer.request, response: pointer.response, requestToResponseMs: pointer.requestToResponseMs, state: pointer.state }, keyboard: { request: keyboard.request, response: keyboard.response, requestToResponseMs: keyboard.requestToResponseMs, state: keyboard.state }, pageErrors, consoleErrors }, null, 2));
await context.close();
await browser.close();
