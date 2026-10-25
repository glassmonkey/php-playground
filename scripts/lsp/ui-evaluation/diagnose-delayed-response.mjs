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
const outDir = path.join(outRoot, `${app}-delay-${runId}`);
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
const page = await context.newPage();
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL.slice(0, -1) });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
await page.addInitScript(() => {
	window.__lspObserved = [];
	window.__delayedResponses = [];
	window.__delayNext = null;
	const NativeWorker = window.Worker;
	window.Worker = class extends NativeWorker {
		constructor(...args) {
			super(...args);
			this.__requestMap = new Map();
			this.__workerState = { terminated: false };
			const replayed = new WeakSet();
			this.addEventListener('message', (event) => {
				if (replayed.has(event)) return;
				const data = event.data;
				if (data?.jsonrpc !== '2.0' || data.id === undefined) return;
				const request = this.__requestMap.get(data.id);
				const delay = window.__delayNext;
				if (delay && request?.method === delay.method) {
					window.__delayNext = null;
					event.stopImmediatePropagation();
					const record = { type: 'intercepted', request, responseId: data.id, result: data.result, error: data.error, interceptedAt: performance.now(), delayMs: delay.delayMs, terminatedAtIntercept: this.__workerState.terminated };
					window.__delayedResponses.push(record);
					setTimeout(() => {
						if (this.__workerState.terminated) {
							record.delivery = 'dropped-after-worker-termination';
							record.finishedAt = performance.now();
							return;
						}
						const replay = new MessageEvent('message', { data });
						replayed.add(replay);
						record.delivery = 'replayed-to-ui';
						record.finishedAt = performance.now();
						this.dispatchEvent(replay);
					}, delay.delayMs);
					return;
				}
				window.__lspObserved.push({ direction: 'worker->ui', at: performance.now(), id: data.id, method: request?.method, result: data.result, error: data.error, delayed: false });
			}, true);
		}
		postMessage(data, ...args) {
			if (data?.jsonrpc === '2.0' && (data.id !== undefined || data.method?.startsWith('textDocument/'))) {
				const event = { direction: 'ui->worker', at: performance.now(), id: data.id, method: data.method, params: data.params };
				window.__lspObserved.push(event);
				if (data.id !== undefined) this.__requestMap.set(data.id, event);
			}
			return super.postMessage(data, ...args);
		}
		terminate() {
			this.__workerState.terminated = true;
			this.__wasTerminated = true;
			window.__lspObserved.push({ direction: 'terminated', at: performance.now() });
			return super.terminate();
		}
	};
});

const fixture = await fs.readFile('docs/lsp/ui-evaluation/fixture.php', 'utf8');
const fixtureBase = fixture.replace(/\n\$number = 1;\n$/, '\n$number = 1;');
const pageErrorsAt = new Date().toISOString();
await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
await page.locator('.monaco-editor .view-lines').waitFor({ timeout: 30000 });
const checkbox = page.getByTestId('checkbox-completion');
if (!(await checkbox.isChecked().catch(() => false))) await checkbox.click();
await page.waitForFunction(() => window.__lspObserved?.some((e) => e.method === 'initialize' && e.direction === 'ui->worker') && window.__lspObserved?.some((e) => e.direction === 'worker->ui' && e.result?.capabilities), undefined, { timeout: 30000 });
const editor = page.locator('.monaco-editor').first();

async function replaceCode(code) {
	await page.evaluate((value) => navigator.clipboard.writeText(value), code);
	await editor.click({ position: { x: 250, y: 160 } });
	await page.keyboard.press('Meta+A');
	await page.keyboard.press('Meta+V');
	await page.waitForFunction((value) => window.__lspObserved?.some((e) => e.method === 'textDocument/didChange' && e.params?.contentChanges?.some((c) => c.text === value)), code, { timeout: 5000 });
	await page.keyboard.press('Control+End');
	return page.evaluate((value) => [...window.__lspObserved].reverse().find((e) => e.method === 'textDocument/didChange' && e.params?.contentChanges?.some((c) => c.text === value)), code);
}
async function state() {
	return page.evaluate(() => {
		const editorText = document.querySelector('.monaco-editor .view-lines')?.innerText ?? '';
		const suggest = document.querySelector('.suggest-widget');
		const hover = document.querySelector('.monaco-editor .monaco-hover');
		return {
			editorText,
			activeElement: document.activeElement ? { tag: document.activeElement.tagName, className: document.activeElement.className?.toString?.() ?? '', ariaLabel: document.activeElement.getAttribute('aria-label') } : null,
			cursorStyle: document.querySelector('.monaco-editor .cursors-layer .cursor')?.getAttribute('style') ?? null,
			phpVersion: document.querySelector('[class*="singleValue"]')?.innerText ?? null,
			completionChecked: document.querySelector('[data-testid="checkbox-completion"] input')?.checked ?? null,
			suggest: suggest ? { visible: Boolean(suggest.getClientRects().length && getComputedStyle(suggest).visibility !== 'hidden'), rows: [...suggest.querySelectorAll('.monaco-list-row')].map((row) => row.innerText) } : null,
			hover: hover ? { visible: Boolean(hover.getClientRects().length && getComputedStyle(hover).visibility !== 'hidden'), text: hover.innerText } : null,
		};
	});
}
async function armDelay(method, delayMs = 1400) {
	await page.evaluate(({ method, delayMs }) => { window.__delayNext = { method, delayMs }; }, { method, delayMs });
}
async function waitIntercepted(afterCount = 0) {
	await page.waitForFunction((count) => window.__delayedResponses?.length > count, afterCount, { timeout: 10000 });
	return page.evaluate(() => window.__delayedResponses.at(-1));
}
async function screenshot(name) { await page.screenshot({ path: path.join(outDir, `${name}.png`) }); }

// Case 1: allow the old member completion to arrive after a new, narrower request.
await replaceCode(`${fixtureBase}\n$greeter`);
await armDelay('textDocument/completion', 1400);
const naturalInputAt = await page.evaluate(() => performance.now());
await page.keyboard.type('->', { delay: 80 });
const oldCompletion = await waitIntercepted();
const textAtOldResponse = await state();
await replaceCode(`${fixtureBase}\n$greeter->g`);
const currentText = `${fixtureBase}\n$greeter->g`;
const currentPosition = { line: currentText.split('\n').length - 1, character: currentText.split('\n').at(-1).length };
const manualAfterChangeAt = await page.evaluate(() => performance.now());
await page.keyboard.press('Control+Space');
await page.waitForFunction(({ at, pos }) => window.__lspObserved?.some((e) => e.direction === 'ui->worker' && e.method === 'textDocument/completion' && e.at >= at && e.params?.position?.line === pos.line && e.params?.position?.character === pos.character), { at: manualAfterChangeAt, pos: currentPosition }, { timeout: 5000 });
const currentRequest = [...await page.evaluate(() => window.__lspObserved)].reverse().find((e) => e.direction === 'ui->worker' && e.method === 'textDocument/completion' && e.at >= manualAfterChangeAt && e.params?.position?.line === currentPosition.line && e.params?.position?.character === currentPosition.character);
await page.waitForFunction((id) => window.__lspObserved?.some((e) => e.direction === 'worker->ui' && e.id === id), currentRequest.id, { timeout: 15000 });
await page.waitForTimeout(100);
const currentRowsBeforeOld = await state();
await screenshot('input-change-before-old-response');
await page.waitForFunction(() => window.__delayedResponses?.at(-1)?.delivery, undefined, { timeout: 5000 });
await page.waitForTimeout(100);
const afterOldResponse = await state();
await screenshot('input-change-after-old-response');
const inputChangeCase = {
	name: 'old-completion-after-input-change', naturalInputAt, oldRequest: oldCompletion.request, oldResponse: oldCompletion.result, oldResponseInterceptedAt: oldCompletion.interceptedAt,
	oldResponseDelivery: oldCompletion.delivery, oldResponseFinishedAt: oldCompletion.finishedAt, delayMs: oldCompletion.delayMs,
	textAtOldResponse, currentText, currentPosition, currentRequest, currentResponse: await page.evaluate((id) => window.__lspObserved.find((e) => e.direction === 'worker->ui' && e.id === id), currentRequest.id),
	currentRowsBeforeOld, afterOldResponse, screenshotBefore: 'input-change-before-old-response.png', screenshotAfter: 'input-change-after-old-response.png',
};

// Case 2: terminate the worker while a hover response is held, then verify re-init recovery.
await page.keyboard.press('Escape');
await replaceCode(fixture);
await page.mouse.move(5, 5);
await page.waitForTimeout(200);
const injectionsBeforeHover = await page.evaluate(() => window.__delayedResponses.length);
await armDelay('textDocument/hover', 1400);
const symbolLine = page.locator('.view-line').filter({ hasText: '$greeter = new Greeter' }).last();
const symbolBox = await symbolLine.boundingBox();
const hoverStart = await page.evaluate(() => performance.now());
if (!symbolBox) throw new Error('Could not locate hover symbol');
await page.mouse.move(symbolBox.x + 24, symbolBox.y + symbolBox.height / 2);
const oldHover = await waitIntercepted(injectionsBeforeHover);
const hoverWhileHeld = await state();
await checkbox.click();
const terminated = await page.waitForFunction(() => window.__lspObserved?.some((e) => e.direction === 'terminated'), undefined, { timeout: 3000 }).then(() => true).catch(() => false);
await page.waitForFunction(() => window.__delayedResponses?.at(-1)?.delivery, undefined, { timeout: 5000 });
const hoverAfterOff = await state();
await screenshot('checkbox-off-during-hover');
const initBeforeRecovery = await page.evaluate(() => window.__lspObserved.filter((e) => e.direction === 'ui->worker' && e.method === 'initialize').length);
await checkbox.click();
await page.waitForFunction((n) => window.__lspObserved?.filter((e) => e.direction === 'ui->worker' && e.method === 'initialize').length > n, initBeforeRecovery, { timeout: 30000 });
await page.waitForFunction(() => window.__lspObserved?.some((e) => e.method === 'textDocument/didOpen' && e.params?.textDocument?.text?.includes('$greeter = new Greeter')), undefined, { timeout: 10000 });
await page.mouse.move(5, 5);
await page.waitForTimeout(100);
const recoveryStart = await page.evaluate(() => performance.now());
await page.mouse.move(symbolBox.x + 24, symbolBox.y + symbolBox.height / 2);
await page.waitForFunction((at) => window.__lspObserved?.some((e) => e.direction === 'ui->worker' && e.method === 'textDocument/hover' && e.at >= at), recoveryStart, { timeout: 5000 }).catch(() => {});
const recoveryRequest = [...await page.evaluate(() => window.__lspObserved)].reverse().find((e) => e.direction === 'ui->worker' && e.method === 'textDocument/hover' && e.at >= recoveryStart);
if (recoveryRequest) await page.waitForFunction((id) => window.__lspObserved?.some((e) => e.direction === 'worker->ui' && e.id === id), recoveryRequest.id, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(500);
const hoverAfterRecovery = await state();
await screenshot('checkbox-on-hover-recovery');
const checkboxCase = {
	name: 'hover-response-after-completion-off', hoverStart, oldRequest: oldHover.request, oldResponse: oldHover.result,
	oldResponseDelivery: oldHover.delivery, oldResponseFinishedAt: oldHover.finishedAt, delayMs: oldHover.delayMs, hoverWhileHeld,
	terminated, hoverAfterOff, initBeforeRecovery, recoveryRequest, hoverAfterRecovery,
	screenshots: ['checkbox-off-during-hover.png', 'checkbox-on-hover-recovery.png'],
};

const result = {
	app, runId, startedAt: pageErrorsAt, url: page.url(), browser: browser.version(), phpVersion: '8.5 (UI selected)',
	fixture, injectionBoundary: 'Isolated page Worker message capture-phase listener delays a selected response before app listeners; no product Worker/server/source modified.',
	inputChangeCase, checkboxCase, pageErrors, allEvents: await page.evaluate(() => window.__lspObserved), injections: await page.evaluate(() => window.__delayedResponses),
};
await fs.writeFile(path.join(outDir, 'trace.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ app, runId, inputChange: { oldRequest: inputChangeCase.oldRequest, oldResponseDelivery: inputChangeCase.oldResponseDelivery, currentRequest: inputChangeCase.currentRequest, currentRowsBeforeOld: inputChangeCase.currentRowsBeforeOld.suggest, afterOld: inputChangeCase.afterOldResponse.suggest }, checkbox: { oldRequest: checkboxCase.oldRequest, delivery: checkboxCase.oldResponseDelivery, terminated, hoverAfterOff: checkboxCase.hoverAfterOff.hover, recoveryRequest, recovered: checkboxCase.hoverAfterRecovery.hover }, pageErrors }, null, 2));
await context.close();
await browser.close();
