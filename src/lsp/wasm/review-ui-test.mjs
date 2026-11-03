#!/usr/bin/env node
import { chromium, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import lzString from 'lz-string';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4238';
const output =
	process.env.PHPANTOM_REVIEW_OUT ??
	resolve(root, 'build/phpantom-review-ui-result.json');
const report = { baseURL, startedAt: new Date().toISOString(), cases: [] };
await mkdir(dirname(output), { recursive: true });
const browser = await chromium.launch({ headless: true, timeout: 10_000 });
const persist = () => writeFile(output, JSON.stringify(report, null, 2) + '\n');
async function run(name, action) {
	console.log(`START ${name}`);
	const context = await browser.newContext();
	const page = await context.newPage();
	page.setDefaultTimeout(10_000);
	await page.addInitScript(() => {
		window.__reviewWorkers = [];
		window.__reviewCompiles = [];
		const compile = WebAssembly.compile.bind(WebAssembly);
		WebAssembly.compile = (...args) => {
			const trace = { done: false };
			window.__reviewCompiles.push(trace);
			return compile(...args).finally(() => {
				trace.done = true;
			});
		};
		const original = window.Worker;
		window.Worker = new Proxy(original, {
			construct(target, args) {
				const worker = Reflect.construct(target, args);
				const trace = {
					id: window.__reviewWorkers.length,
					sent: [],
					received: [],
					terminated: false,
				};
				window.__reviewWorkers.push(trace);
				const post = worker.postMessage.bind(worker),
					terminate = worker.terminate.bind(worker);
				worker.postMessage = (message, ...transfer) => {
					trace.sent.push(
						message?.type === 'phpantom:bootstrap'
							? {
									type: message.type,
									phpVersion: message.phpVersion,
								}
							: message
					);
					return post(message, ...transfer);
				};
				worker.terminate = () => {
					trace.terminated = true;
					return terminate();
				};
				worker.addEventListener('message', (event) =>
					trace.received.push(event.data)
				);
				return worker;
			},
		});
	});
	try {
		const evidence = await action(page, context);
		report.cases.push({ name, status: 'passed', ...evidence });
		console.log(`PASS ${name}`);
	} catch (error) {
		report.cases.push({
			name,
			status: 'failed',
			error: String(error),
			workers: await page
				.evaluate(() => window.__reviewWorkers)
				.catch(() => []),
		});
		console.error(`FAIL ${name}: ${error}`);
	} finally {
		await context.close();
		await persist();
	}
}
async function open(page, source = '<?php\nstr', version = '8.5', ac = '1') {
	const params = new URLSearchParams({
		v: version,
		ac,
		f: 'console',
		c: lzString.compressToEncodedURIComponent(source),
	});
	await page.goto(`${baseURL}/?${params}`, { timeout: 15_000 });
	await page.locator('.monaco-editor .view-lines').waitFor();
}
async function ready(page, version, after = -1) {
	await page.waitForFunction(
		({ version, after }) =>
			window.__reviewWorkers.some((w) => {
				const init = w.sent.find(
					(m) =>
						m.method === 'initialize' &&
						m.params.initializationOptions.phpVersion === version
				);
				return (
					w.id > after &&
					!w.terminated &&
					init &&
					w.received.some(
						(m) => m.id === init.id && m.result?.serverInfo?.version
					)
				);
			}),
		{ version, after },
		{ timeout: 25_000 }
	);
	return page.evaluate(
		(version) =>
			window.__reviewWorkers
				.filter(
					(w) =>
						!w.terminated &&
						w.sent.some(
							(m) =>
								m.type === 'phpantom:bootstrap' &&
								m.phpVersion === version
						)
				)
				.at(-1),
		version
	);
}
async function workers(page) {
	return page.evaluate(() =>
		window.__reviewWorkers.filter((w) =>
			w.sent.some((m) => m.type === 'phpantom:bootstrap')
		)
	);
}
async function text(page) {
	return page.evaluate(() => {
		const active = window.__reviewWorkers
			.filter(
				(w) =>
					!w.terminated &&
					w.sent.some((m) => m.type === 'phpantom:bootstrap')
			)
			.at(-1);
		const message = active?.sent
			.filter(
				(m) =>
					m.method === 'textDocument/didChange' ||
					m.method === 'textDocument/didOpen'
			)
			.at(-1);
		return message?.method === 'textDocument/didChange'
			? message.params.contentChanges[0].text
			: message?.params.textDocument.text;
	});
}
async function focusEnd(page) {
	await page
		.locator('.monaco-editor .view-lines')
		.click({ position: { x: 24, y: 14 } });
	await page.keyboard.press('Control+End');
	// Monaco selects its platform shortcut from browser environment.
	const mac = await page
		.locator('.monaco-editor')
		.evaluate((e) => e.classList.contains('mac'));
	if (mac) await page.keyboard.press('Meta+End');
}
async function accept(page, label, suffix) {
	await focusEnd(page);
	await page.keyboard.type(suffix, { delay: 40 });
	const rows = page.locator('.suggest-widget .monaco-list-row');
	const row = rows
		.filter({
			has: page
				.locator('.label-name')
				.filter({ hasText: new RegExp(`^${label}$`) }),
		})
		.first();
	await row.waitFor({ state: 'visible' });
	const displayed = await rows.allTextContents();
	await row.click();
	await page.keyboard.press('Escape');
	return displayed;
}
async function selectVersion(page, version) {
	await page.locator('#select-input-php').fill(version);
	await page.keyboard.press('Tab');
	await expect(page).toHaveURL(
		new RegExp(`[?&]v=${version.replace('.', '\\.')}(?:&|$)`)
	);
}
try {
	await run(
		'namespaced DateTime acceptance applies import and executes global class',
		async (page) => {
			await open(page, '<?php\nnamespace App;\nnew DateT');
			await ready(page, '8.5');
			const rows = await accept(page, 'DateTime', 'i');
			const accepted =
				'<?php\nnamespace App;\n\nuse DateTime;\nnew DateTime()';
			await expect.poll(() => text(page)).toBe(accepted);
			await page.keyboard.type('; echo get_class(new DateTime());');
			const final = accepted + '; echo get_class(new DateTime());';
			await expect.poll(() => text(page)).toBe(final);
			await expect(page.getByTestId('preview-console')).toHaveText(
				'DateTime'
			);
			return {
				rows,
				acceptedDocument: accepted,
				finalDocument: await text(page),
				execution: await page
					.getByTestId('preview-console')
					.textContent(),
			};
		}
	);
	await run(
		'namespaced project class acceptance imports the selected symbol once',
		async (page) => {
			await open(
				page,
				'<?php\nnamespace Foo { class Widget {} }\nnamespace Bar { new Wid'
			);
			await ready(page, '8.5');
			const rows = await accept(page, 'Widget', 'g');
			const accepted =
				'<?php\nnamespace Foo { class Widget {} }\nnamespace Bar { use Foo\\Widget; new Widget()';
			await expect.poll(() => text(page)).toBe(accepted);
			await page.keyboard.type('; echo get_class(new Widget()); }');
			const final = accepted + '; echo get_class(new Widget()); }';
			await expect.poll(() => text(page)).toBe(final);
			await expect(page.getByTestId('preview-console')).toHaveText(
				'Foo\\Widget'
			);
			return {
				rows,
				finalDocument: await text(page),
				execution: await page
					.getByTestId('preview-console')
					.textContent(),
			};
		}
	);
	await run(
		'cold download beyond 15 seconds becomes ready without toggling',
		async (page) => {
			let requested = false;
			await page.route('**/lsp/phpantom/php-8.5.wasm*', async (route) => {
				requested = true;
				const response = await route.fetch();
				await new Promise((resolve) => setTimeout(resolve, 16_000));
				await route.fulfill({ response });
			});
			await open(page);
			await expect.poll(() => requested).toBe(true);
			await expect(
				page.getByTestId('checkbox-auto-complete')
			).toBeChecked();
			const worker = await ready(page, '8.5');
			const rows = await accept(page, 'strlen', 'l');
			await expect.poll(() => text(page)).toBe('<?php\nstrlen()');
			return {
				workerId: worker.id,
				delayedResponseMs: 16_000,
				rows,
				finalDocument: await text(page),
			};
		}
	);
	await run(
		'ac=0 starts without any PHPantom fetch or worker',
		async (page) => {
			const requests = [];
			page.on('request', (request) => {
				if (request.url().includes('/lsp/phpantom/'))
					requests.push(request.url());
			});
			await open(page, '<?php echo "off";', '8.5', '0');
			await expect(page.getByTestId('preview-console')).toHaveText('off');
			await expect(
				page.getByTestId('checkbox-auto-complete')
			).not.toBeChecked();
			expect({ requests, workers: await workers(page) }).toEqual({
				requests: [],
				workers: [],
			});
			return { requests, workers: await workers(page) };
		}
	);
	for (const mode of ['off', 'version']) {
		await run(
			`${mode} during pending load creates no stale PHP 8.5 worker`,
			async (page) => {
				let release;
				let requested = false;
				const held = new Promise((resolve) => {
					release = resolve;
				});
				await page.route(
					'**/lsp/phpantom/php-8.5.wasm*',
					async (route) => {
						const response = await route.fetch();
						requested = true;
						await held;
						await route
							.fulfill({ response })
							.catch(() => undefined);
					}
				);
				await open(page);
				await expect.poll(() => requested).toBe(true);
				expect(await workers(page)).toEqual([]);
				if (mode === 'off') {
					await page
						.getByText('Auto complete', { exact: true })
						.click();
					await expect(
						page.getByTestId('checkbox-auto-complete')
					).not.toBeChecked();
				} else {
					await selectVersion(page, '8.4');
					await ready(page, '8.4');
				}
				release();
				await page.waitForFunction(
					(count) =>
						window.__reviewCompiles.length === count &&
						window.__reviewCompiles.every((c) => c.done),
					mode === 'off' ? 1 : 2
				);
				const afterRelease = await workers(page);
				expect(
					afterRelease.map(
						(w) =>
							w.sent.find((m) => m.type === 'phpantom:bootstrap')
								.phpVersion
					)
				).toEqual(mode === 'off' ? [] : ['8.4']);
				if (mode === 'off') {
					await page
						.getByText('Auto complete', { exact: true })
						.click();
					await ready(page, '8.5');
				}
				const rows = await accept(page, 'strlen', 'l');
				await expect.poll(() => text(page)).toBe('<?php\nstrlen()');
				return {
					afterRelease,
					rows,
					finalWorkers: await workers(page),
				};
			}
		);
	}
	await run(
		'ready version switch replaces and terminates the previous worker',
		async (page) => {
			await open(page);
			const first = await ready(page, '8.5');
			await selectVersion(page, '8.4');
			const second = await ready(page, '8.4', first.id);
			const observed = await workers(page);
			expect(
				observed.filter((w) => !w.terminated).map((w) => w.id)
			).toEqual([second.id]);
			expect(observed.find((w) => w.id === first.id).terminated).toBe(
				true
			);
			await accept(page, 'strlen', 'l');
			await expect.poll(() => text(page)).toBe('<?php\nstrlen()');
			return { first: first.id, second: second.id, workers: observed };
		}
	);
} finally {
	await browser.close();
}
report.finishedAt = new Date().toISOString();
report.summary = {
	passed: report.cases.filter((c) => c.status === 'passed').length,
	failed: report.cases.filter((c) => c.status === 'failed').length,
};
await persist();
console.log(JSON.stringify(report.summary));
if (report.summary.failed) process.exitCode = 1;
