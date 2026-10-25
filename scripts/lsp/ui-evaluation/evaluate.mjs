import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire('/Users/glassmonkey/src/github.com/glassmonkey/php-playground/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const app = process.argv[2] ?? 'phpantom';
const port = app === 'phpactor' ? 3471 : 7260;
const baseURL = `http://127.0.0.1:${port}/?v=8.5&f=html`;
const outDir = path.resolve('docs/lsp/ui-evaluation/evidence');
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const runDir = path.join(outDir, `${app}-${runId}`);
await fs.mkdir(runDir, { recursive: true });
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
	headless: true,
	executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	args: ['--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
const page = await context.newPage();
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL.slice(0, -1) });
const consoleLines = [];
const browserErrors = [];
page.on('console', (message) => consoleLines.push({ type: message.type(), text: message.text() }));
page.on('pageerror', (error) => browserErrors.push(error.message));
await page.addInitScript(() => {
	const NativeWorker = window.Worker;
	window.__lspObserved = [];
	window.Worker = class extends NativeWorker {
		constructor(...args) {
			super(...args);
			this.addEventListener('message', (event) => {
				const data = event.data;
				if (data?.jsonrpc === '2.0' && (data.id !== undefined || data.method?.startsWith('textDocument/'))) {
					const item = { direction: 'worker->ui', at: performance.now(), id: data.id, method: data.method, result: data.result, error: data.error };
					window.__lspObserved.push(item);
					console.debug('__LSP__' + JSON.stringify(item));
				}
			});
		}
		postMessage(data, ...args) {
			if (data?.jsonrpc === '2.0' && (data.id !== undefined || data.method?.startsWith('textDocument/'))) {
				const item = { direction: 'ui->worker', at: performance.now(), id: data.id, method: data.method, params: data.params };
				window.__lspObserved.push(item);
				console.debug('__LSP__' + JSON.stringify(item));
			}
			return super.postMessage(data, ...args);
		}
		terminate() {
			window.__lspObserved.push({ direction: 'terminated', at: performance.now() });
			return super.terminate();
		}
	};
});
const startedAt = new Date().toISOString();
await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
await page.locator('.monaco-editor .view-lines').waitFor({ timeout: 30000 });
await page.getByTestId('checkbox-completion').click();
await page.waitForFunction(() => document.body.innerText.includes('Completion') && window.__lspObserved?.some((event) => event.method === 'initialize' && event.direction === 'ui->worker') && window.__lspObserved?.some((event) => event.direction === 'worker->ui' && event.result?.capabilities), { timeout: 30000 }).catch(() => {});
const statusAtReady = await page.locator('[role="status"]').allTextContents().catch(() => []);
const editor = page.locator('.monaco-editor').first();
async function replaceCode(code) {
	await page.evaluate((value) => navigator.clipboard.writeText(value), code);
	await editor.click({ position: { x: 250, y: 160 } });
	await page.keyboard.press('Meta+A');
	await page.keyboard.press('Meta+V');
	await page.waitForFunction((value) => window.__lspObserved?.some((event) => event.direction === 'ui->worker' && event.method === 'textDocument/didChange' && event.params?.contentChanges?.some((change) => change.text === value)), code, { timeout: 5000 });
	// Pasting into Monaco can leave the replaced text selected in one target UI.
	// Move to the document end explicitly so subsequent real-key scenarios append.
	await page.keyboard.press('Control+End');
	const changes = await page.evaluate((value) => window.__lspObserved.filter((event) => event.direction === 'ui->worker' && event.method === 'textDocument/didChange' && event.params?.contentChanges?.some((change) => change.text === value)), code);
	return changes.at(-1);
}
const initialCode = `<?php
function greetUser(string $name = 'Guest'): string { return 'Hello ' . $name; }
function addNumbers(int $left, int $right): int { return $left + $right; }
class Greeter { public string $message; public function greet(): string { return 'hi'; } public static function create(): self { return new self(); } }
$greeting = greetUser('A');
$greeter = new Greeter();
$number = 1;
$number->
`;
await replaceCode(initialCode);
await page.waitForTimeout(500);
async function snapshot(name) {
	const rows = await page.locator('.suggest-widget .monaco-list-row').evaluateAll((els) => els.map((el) => ({ label: el.getAttribute('aria-label'), text: el.innerText, selected: el.getAttribute('aria-selected') })));
	const visible = await page.locator('.suggest-widget').isVisible().catch(() => false);
	const eventSlice = await page.evaluate(() => window.__lspObserved ?? []);
	const filename = `${app}-${name}.png`;
	await page.screenshot({ path: path.join(runDir, filename), fullPage: false });
	return { name, visible, rows, screenshot: filename, events: eventSlice };
}
const output = { app, runId, url: baseURL, startedAt, browser: browser.version(), phpVersion: await page.locator('[class*="singleValue"]').innerText().catch(() => null), viewport: { width: 1440, height: 1000 }, instrumentation: 'Playwright isolated BrowserContext; Worker postMessage/request-response timestamps (performance.now)', statusAtReady, initialCode, scenarios: [], console: consoleLines, errors: browserErrors };
const fixtureBase = initialCode.replace('$number->\n', '');
await page.keyboard.press('Escape');
// Each case waits for a Worker postMessage carrying the exact full didChange text/version before requesting completion.
for (const [name, prefix] of [['builtin-strl', 'strl'], ['local-gre', '$gre'], ['variable-member', '$greeter->'], ['class-static', 'Greeter::'], ['new-class', 'new Gre'], ['local-function', 'greetUser('], ['builtin-signature', 'strlen(']]) {
	const code = initialCode.replace('$number->\n', '') + prefix;
	const didChange = await replaceCode(code);
	const expectedPosition = { line: code.split('\n').length - 1, character: code.split('\n').at(-1).length };
	const expectedVersion = didChange.params.textDocument.version;
	for (let round = 1; round <= 2; round++) {
		const started = await page.evaluate(() => performance.now());
		await page.keyboard.press('Control+Space');
		await page.waitForFunction(({ started, expectedPosition }) => window.__lspObserved?.some((event) => event.direction === 'ui->worker' && event.method === 'textDocument/completion' && event.at >= started && event.params?.position?.line === expectedPosition.line && event.params?.position?.character === expectedPosition.character), { started, expectedPosition }, { timeout: 5000 }).catch(() => {});
		const events = await page.evaluate(() => window.__lspObserved ?? []);
		const request = [...events].reverse().find((event) => event.direction === 'ui->worker' && event.method === 'textDocument/completion' && event.at >= started && event.params?.position?.line === expectedPosition.line && event.params?.position?.character === expectedPosition.character);
		if (request) await page.waitForFunction((id) => window.__lspObserved?.some((event) => event.direction === 'worker->ui' && event.id === id), request.id, { timeout: 15000 }).catch(() => {});
		const completedEvents = await page.evaluate(() => window.__lspObserved ?? []);
		const response = request && completedEvents.find((event) => event.direction === 'worker->ui' && event.id === request.id);
		const latestChangeBeforeRequest = request && completedEvents.filter((event) => event.direction === 'ui->worker' && event.method === 'textDocument/didChange' && event.at <= request.at).at(-1);
		const rowLocator = page.locator('.suggest-widget .monaco-list-row');
		await page.waitForFunction(() => document.querySelector('.suggest-widget .monaco-list-row'), { timeout: 2000 }).catch(() => {});
		const found = await rowLocator.count() > 0;
		const displayAt = found ? await page.evaluate(() => performance.now()) : null;
		const sample = { ...(await snapshot(`${name}-r${round}`)), expectedPosition, expectedVersion, changeAt: didChange.at, requestAt: request?.at ?? null, responseAt: response?.at ?? null, displayAt, requestId: request?.id ?? null, orderValid: Boolean(request && latestChangeBeforeRequest?.params?.textDocument?.version === expectedVersion && latestChangeBeforeRequest?.params?.contentChanges?.some((change) => change.text === code) && request.at >= didChange.at && request.params.position.line === expectedPosition.line && request.params.position.character === expectedPosition.character), responseResult: response?.result ?? null, rpcRoundTripMs: request && response ? response.at - request.at : null, requestToRowsMs: found && request ? displayAt - request.at : null };
		output.scenarios.push(sample);
		if (name === 'builtin-strl' && round === 2 && found) {
			const before = await page.locator('.monaco-editor .view-lines').innerText().catch(() => '');
			await page.keyboard.press('Enter');
			await page.waitForTimeout(150);
			const after = await page.locator('.monaco-editor .view-lines').innerText().catch(() => '');
			await page.keyboard.press('Tab');
			const afterTab = await page.locator('.monaco-editor .view-lines').innerText().catch(() => '');
			await page.keyboard.type(';');
			const afterTabType = await page.locator('.monaco-editor .view-lines').innerText().catch(() => '');
			output.insertionEvidence = { before, after, afterTab, afterTabType, screenshot: 'builtin-strl-insert.png' };
			await page.screenshot({ path: path.join(runDir, output.insertionEvidence.screenshot), fullPage: false });
			await page.screenshot({ path: path.join(runDir, 'builtin-strl-tab.png'), fullPage: false });
		}
		await page.keyboard.press('Escape');
	}
}
// Variable insertion checks whether a `$` prefix is replaced or duplicated.
const variableCode = fixtureBase + '\n$gre';
await replaceCode(variableCode);
const variablePosition = { line: variableCode.split('\n').length - 1, character: variableCode.split('\n').at(-1).length };
await page.keyboard.press('Control+Space');
await page.waitForFunction(({ position }) => window.__lspObserved?.some((event) => event.direction === 'ui->worker' && event.method === 'textDocument/completion' && event.params?.position?.line === position.line && event.params?.position?.character === position.character), { position: variablePosition }, { timeout: 5000 }).catch(() => {});
const variableRequest = [...await page.evaluate(() => window.__lspObserved ?? [])].reverse().find((event) => event.direction === 'ui->worker' && event.method === 'textDocument/completion' && event.params?.position?.line === variablePosition.line && event.params?.position?.character === variablePosition.character);
if (variableRequest) await page.waitForFunction((id) => window.__lspObserved?.some((event) => event.direction === 'worker->ui' && event.id === id), variableRequest.id, { timeout: 15000 }).catch(() => {});
const variableRows = await page.locator('.suggest-widget .monaco-list-row').evaluateAll((els) => els.map((el) => el.innerText));
await page.screenshot({ path: path.join(runDir, 'local-variable-suggestions.png'), fullPage: false });
await page.keyboard.press('Enter');
const variableAfterRaw = await page.locator('.monaco-editor .view-lines').innerText().catch(() => '');
const variableAfter = variableAfterRaw.replaceAll('\u00a0', ' ');
output.insertionEvidence.variable = { before: variableCode, candidateRows: variableRows, after: variableAfter, doubledDollar: variableAfter.includes('$$greeter'), screenshot: 'local-variable-suggestions.png' };
await page.screenshot({ path: path.join(runDir, 'local-variable-insert.png'), fullPage: false });
async function typeTrigger(name, beforeTrigger, trigger) {
	const typedCode = fixtureBase + beforeTrigger;
	await replaceCode(typedCode);
	const typedAt = await page.evaluate(() => performance.now());
	await page.keyboard.type(trigger, { delay: 80 });
	const fullText = typedCode + trigger;
	await page.waitForFunction((value) => window.__lspObserved?.some((event) => event.direction === 'ui->worker' && event.method === 'textDocument/didChange' && event.params?.contentChanges?.some((change) => change.text === value)), fullText, { timeout: 5000 }).catch(() => {});
	const expectedPosition = { line: fullText.split('\n').length - 1, character: fullText.split('\n').at(-1).length };
	await page.waitForFunction(({ typedAt, expectedPosition }) => window.__lspObserved?.some((event) => event.direction === 'ui->worker' && event.method === 'textDocument/completion' && event.at >= typedAt && event.params?.position?.line === expectedPosition.line && event.params?.position?.character === expectedPosition.character), { typedAt, expectedPosition }, { timeout: 5000 }).catch(() => {});
	let events = await page.evaluate(() => window.__lspObserved ?? []);
	const request = [...events].reverse().find((event) => event.direction === 'ui->worker' && event.method === 'textDocument/completion' && event.at >= typedAt && event.params?.position?.line === expectedPosition.line && event.params?.position?.character === expectedPosition.character);
	if (request) await page.waitForFunction((id) => window.__lspObserved?.some((event) => event.direction === 'worker->ui' && event.id === id), request.id, { timeout: 15000 }).catch(() => {});
	events = await page.evaluate(() => window.__lspObserved ?? []);
	const response = request && events.find((event) => event.direction === 'worker->ui' && event.id === request.id);
	const docChange = events.filter((event) => event.direction === 'ui->worker' && event.method === 'textDocument/didChange' && event.params?.contentChanges?.some((change) => change.text === fullText) && event.at <= (request?.at ?? Infinity)).at(-1);
	await page.waitForFunction(() => document.querySelector('.suggest-widget .monaco-list-row'), { timeout: 3000 }).catch(() => {});
	const visible = await page.locator('.suggest-widget').isVisible().catch(() => false);
	const rows = await page.locator('.suggest-widget .monaco-list-row').evaluateAll((els) => els.map((el) => el.innerText));
	const editorState = await page.evaluate(() => ({
		visibleEditorText: document.querySelector('.monaco-editor .view-lines')?.innerText ?? null,
		activeElement: document.activeElement ? { tag: document.activeElement.tagName, className: document.activeElement.className, ariaLabel: document.activeElement.getAttribute('aria-label') } : null,
		inputArea: (() => { const el = document.querySelector('.monaco-editor textarea.inputarea'); return el ? { value: el.value, selectionStart: el.selectionStart, selectionEnd: el.selectionEnd } : null; })(),
		cursorStyle: document.querySelector('.monaco-editor .cursors-layer .cursor')?.getAttribute('style') ?? null,
		phpVersion: document.querySelector('[class*="singleValue"]')?.innerText ?? null,
		completionChecked: document.querySelector('[data-testid="checkbox-completion"] input')?.checked ?? null,
		latestDocumentVersion: [...(window.__lspObserved ?? [])].reverse().find((event) => event.method === 'textDocument/didChange')?.params?.textDocument?.version ?? null,
	}));
	const screenshot = `${name}.png`;
	await page.screenshot({ path: path.join(runDir, screenshot), fullPage: false });
	output.behaviors.push({ name, typedCode, trigger, fullText, expectedPosition, changeVersion: docChange?.params?.textDocument?.version ?? null, changeAt: docChange?.at ?? null, requestAt: request?.at ?? null, responseAt: response?.at ?? null, orderValid: Boolean(docChange && request && docChange.at <= request.at && request.params.position.line === expectedPosition.line && request.params.position.character === expectedPosition.character), rpcRoundTripMs: request && response ? response.at - request.at : null, typingToRequestMs: request ? request.at - typedAt : null, visible, rows, editorState, interveningDocumentChanges: events.filter((event) => event.direction === 'ui->worker' && event.method === 'textDocument/didChange' && event.at >= typedAt).map((event) => ({ at: event.at, version: event.params?.textDocument?.version, changes: event.params?.contentChanges })), screenshot });
	await page.keyboard.press('Escape');
}
output.behaviors = [];
// Actual key input exercises trigger-character handling independently from manual Ctrl+Space.
await typeTrigger('typed-arrow-trigger', '\n$greeter', '->');
await typeTrigger('typed-static-trigger', '\nGreeter', '::');
await typeTrigger('typed-word-auto', '\nstr', 'l');
// Signature help is a distinct LSP request: type '(' after a local and a builtin function name.
async function signatureHelp(name, callStart) {
	const codeBefore = fixtureBase + `\n${callStart}`;
	const baseChange = await replaceCode(codeBefore);
	const started = await page.evaluate(() => performance.now());
	await page.keyboard.press('(');
	const expectedPosition = { line: codeBefore.split('\n').length - 1, character: codeBefore.split('\n').at(-1).length + 1 };
	await page.waitForFunction(({ started, expectedPosition }) => window.__lspObserved?.some((event) => event.direction === 'ui->worker' && event.method === 'textDocument/signatureHelp' && event.at >= started && event.params?.position?.line === expectedPosition.line && event.params?.position?.character === expectedPosition.character), { started, expectedPosition }, { timeout: 5000 }).catch(() => {});
	const events = await page.evaluate(() => window.__lspObserved ?? []);
	const request = [...events].reverse().find((event) => event.direction === 'ui->worker' && event.method === 'textDocument/signatureHelp' && event.at >= started);
	if (request) await page.waitForFunction((id) => window.__lspObserved?.some((event) => event.direction === 'worker->ui' && event.id === id), request.id, { timeout: 15000 }).catch(() => {});
	const completedEvents = await page.evaluate(() => window.__lspObserved ?? []);
	const didChange = completedEvents.filter((event) => event.direction === 'ui->worker' && event.method === 'textDocument/didChange' && event.params?.textDocument?.version > baseChange.params.textDocument.version && event.at <= (request?.at ?? Infinity)).at(-1);
	const actualText = didChange?.params?.contentChanges?.at(-1)?.text ?? '';
	const response = request && completedEvents.find((event) => event.direction === 'worker->ui' && event.id === request.id);
	const hints = page.locator('.parameter-hints-widget');
	await hints.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
	const visible = await hints.isVisible().catch(() => false);
	const text = await hints.innerText().catch(() => '');
	const screenshot = `${name}.png`;
	await page.screenshot({ path: path.join(runDir, screenshot), fullPage: false });
	output.behaviors.push({ name, expectedPosition, actualTextSuffix: actualText.startsWith(codeBefore) ? actualText.slice(codeBefore.length) : null, changeVersion: didChange?.params?.textDocument?.version ?? null, changeAt: didChange?.at ?? null, requestAt: request?.at ?? null, responseAt: response?.at ?? null, orderValid: Boolean(didChange && request && didChange.at <= request.at && didChange.params.textDocument.version > baseChange.params.textDocument.version && actualText.startsWith(codeBefore) && actualText.includes(`${callStart}(`) && request.params.position.line === expectedPosition.line && request.params.position.character === expectedPosition.character), rpcRoundTripMs: request && response ? response.at - request.at : null, responseResult: response?.result ?? null, visible, text, screenshot });
	await page.keyboard.press('Escape');
}
await signatureHelp('local-signature', '$result = greetUser');
await signatureHelp('builtin-signature-help', '$result = strlen');
// Hover over a local symbol and capture the real Monaco hover widget.
await replaceCode(fixtureBase);
const hoverLine = page.locator('.view-line').filter({ hasText: '$greeter' }).last();
const hoverBox = await hoverLine.boundingBox();
output.hoverDiagnostics = { matchingLines: await hoverLine.count(), text: await hoverLine.innerText().catch(() => ''), box: hoverBox };
if (hoverBox) await page.mouse.move(hoverBox.x + 24, hoverBox.y + hoverBox.height / 2);
const hoverStarted = await page.evaluate(() => performance.now());
await page.waitForFunction((started) => window.__lspObserved?.some((event) => event.direction === 'ui->worker' && event.method === 'textDocument/hover' && event.at >= started), hoverStarted, { timeout: 5000 }).catch(() => {});
let events = await page.evaluate(() => window.__lspObserved ?? []);
const hoverRequest = [...events].reverse().find((event) => event.direction === 'ui->worker' && event.method === 'textDocument/hover' && event.at >= hoverStarted);
if (hoverRequest) await page.waitForFunction((id) => window.__lspObserved?.some((event) => event.direction === 'worker->ui' && event.id === id), hoverRequest.id, { timeout: 15000 }).catch(() => {});
events = await page.evaluate(() => window.__lspObserved ?? []);
const hoverResponse = hoverRequest && events.find((event) => event.direction === 'worker->ui' && event.id === hoverRequest.id);
const hoverWidget = page.locator('.monaco-hover');
await hoverWidget.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
output.behaviors.push({ name: 'hover-local-variable', position: hoverRequest?.params?.position ?? null, rpcRoundTripMs: hoverRequest && hoverResponse ? hoverResponse.at - hoverRequest.at : null, responseResult: hoverResponse?.result ?? null, visible: await hoverWidget.isVisible().catch(() => false), text: await hoverWidget.innerText().catch(() => ''), screenshot: 'hover-local-variable.png' });
await page.screenshot({ path: path.join(runDir, 'hover-local-variable.png'), fullPage: false });
await page.keyboard.press('Escape');
// Toggle the feature and color mode through the UI; count LSP initialization and worker termination.
const completionCheckbox = page.getByTestId('checkbox-completion');
const initCountBefore = await page.evaluate(() => window.__lspObserved.filter((event) => event.method === 'initialize' && event.direction === 'ui->worker').length);
await completionCheckbox.click();
const workerTerminated = await page.waitForFunction(() => window.__lspObserved?.some((event) => event.direction === 'terminated'), { timeout: 3000 }).then(() => true).catch(() => false);
await completionCheckbox.click();
await page.waitForFunction((count) => window.__lspObserved?.filter((event) => event.method === 'initialize' && event.direction === 'ui->worker').length > count, initCountBefore, { timeout: 30000 }).catch(() => {});
output.behaviors.push({ name: 'checkbox-off-on', initializationsBefore: initCountBefore, initializationsAfter: await page.evaluate(() => window.__lspObserved.filter((event) => event.method === 'initialize' && event.direction === 'ui->worker').length), workerTerminated, checkboxChecked: await completionCheckbox.isChecked().catch(() => false), screenshot: 'checkbox-off-on.png' });
await page.screenshot({ path: path.join(runDir, 'checkbox-off-on.png'), fullPage: false });
const themeSwitch = page.locator('label.chakra-switch').first();
await themeSwitch.click();
await page.screenshot({ path: path.join(runDir, 'theme-dark.png'), fullPage: false });
await themeSwitch.click();
await page.screenshot({ path: path.join(runDir, 'theme-light.png'), fullPage: false });
output.behaviors.push({ name: 'theme-toggle', switchCount: await themeSwitch.count(), checkboxVisible: await completionCheckbox.isVisible(), htmlPreviewVisible: await page.getByRole('checkbox', { name: 'HTML Preview' }).isVisible().catch(() => false), screenshotLight: 'theme-light.png', screenshotDark: 'theme-dark.png' });
// Change PHP version through the visible react-select, then restore 8.5 and ensure a new initialize occurs.
async function selectPhpVersion(version) {
	await page.locator('#select-php').click();
	await page.getByRole('option', { name: version, exact: true }).click();
	return page.locator('[class*="singleValue"]').innerText();
}
const initBeforeVersionChange = await page.evaluate(() => window.__lspObserved.filter((event) => event.method === 'initialize' && event.direction === 'ui->worker').length);
const v84 = await selectPhpVersion('8.4').catch((error) => `selection failed: ${error.message}`);
await page.waitForTimeout(500);
const errorStatus84 = await page.locator('[role="status"]').allTextContents().catch(() => []);
await page.screenshot({ path: path.join(runDir, 'version-84.png'), fullPage: false });
const v85 = await selectPhpVersion('8.5').catch((error) => `selection failed: ${error.message}`);
await page.waitForFunction((count) => window.__lspObserved?.filter((event) => event.method === 'initialize' && event.direction === 'ui->worker').length > count, initBeforeVersionChange, { timeout: 30000 }).catch(() => {});
output.behaviors.push({ name: 'version-85-84-85', version84: v84, version85: v85, status84: errorStatus84, initializationsBefore: initBeforeVersionChange, initializationsAfter: await page.evaluate(() => window.__lspObserved.filter((event) => event.method === 'initialize' && event.direction === 'ui->worker').length), screenshot84: 'version-84.png' });
await page.screenshot({ path: path.join(runDir, 'version-85-restored.png'), fullPage: false });
output.finalEvents = await page.evaluate(() => window.__lspObserved ?? []);
output.console = consoleLines;
output.errors = browserErrors;
await fs.writeFile(path.join(runDir, 'trace.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify({ app, runId, browser: output.browser, phpVersion: output.phpVersion, statusAtReady, scenarios: output.scenarios.map(({ name, visible, rows, expectedVersion, expectedPosition, orderValid, rpcRoundTripMs, requestToRowsMs }) => ({ name, visible, count: rows.length, labels: rows.slice(0, 8).map((r) => r.text), expectedVersion, expectedPosition, orderValid, rpcRoundTripMs, requestToRowsMs })), behaviors: output.behaviors, insertion: output.insertionEvidence, errors: browserErrors }, null, 2));
await context.close();
await browser.close();
