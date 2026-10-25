import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire('/Users/glassmonkey/src/github.com/glassmonkey/php-playground/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const app = process.argv[2] ?? 'phpactor';
const port = app === 'phpactor' ? 3471 : 7260;
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const outDir = path.resolve('docs/lsp/ui-evaluation/evidence', `${app}-word-suggestions-${runId}`);
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${port}` });
const page = await context.newPage();
const events = [];
await page.addInitScript(() => {
	window.__observedWorkers = [];
	const NativeWorker = window.Worker;
	window.Worker = class extends NativeWorker {
		postMessage(data, ...args) {
			if (data?.jsonrpc === '2.0') window.__observedWorkers.push(data);
			return super.postMessage(data, ...args);
		}
	};
});
page.on('console', (message) => { if (message.text().startsWith('__LSP__')) events.push(message.text()); });
await page.goto(`http://127.0.0.1:${port}/?v=8.5&f=html`, { waitUntil: 'domcontentloaded' });
await page.locator('.monaco-editor .view-lines').waitFor({ timeout: 30000 });
const completion = page.getByTestId('checkbox-completion');
const completionWasOn = await completion.isChecked();
if (completionWasOn) await completion.click();
const fixture = `<?php
function greetUser(string $name = 'Guest'): string { return 'Hello ' . $name; }
function addNumbers(int $left, int $right): int { return $left + $right; }
class Greeter { public string $message; public function greet(): string { return 'hi'; } }
$greeting = greetUser('A');
$greeter = new Greeter();
$number = 1;
new Gre`;
await page.evaluate((text) => navigator.clipboard.writeText(text), fixture);
const editor = page.locator('.monaco-editor').first();
await editor.click({ position: { x: 250, y: 160 } });
await page.keyboard.press('Meta+A');
await page.keyboard.press('Meta+V');
await page.keyboard.press('Control+Space');
await page.waitForFunction(() => document.querySelector('.suggest-widget .monaco-list-row'), { timeout: 5000 }).catch(() => {});
const rows = await page.locator('.suggest-widget .monaco-list-row').evaluateAll((items) => items.map((item) => item.innerText));
const lspMessages = await page.evaluate(() => window.__observedWorkers);
await page.screenshot({ path: path.join(outDir, 'completion-off-new-gre.png'), fullPage: false });
const output = { app, runId, browser: browser.version(), url: page.url(), phpVersion: await page.locator('[class*="singleValue"]').innerText().catch(() => null), completionWasOn, completionAfter: await completion.isChecked(), fixture, rows, observedJsonRpcMessages: lspMessages, screenshot: 'completion-off-new-gre.png', interpretation: 'Diagnostic condition with LSP Completion disabled; this is separate from the original LSP-on results.' };
await fs.writeFile(path.join(outDir, 'trace.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
await context.close();
await browser.close();
