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
class FixtureError extends Error {}
const selection = process.env.PHPANTOM_REVIEW_CASE ?? 'all';
if (
	![
		'all',
		'DateTime',
		'Widget',
		'startup',
		'cancellation',
		'semantics',
	].includes(selection)
)
	throw new Error('Unknown review case selection');
async function run(name, action) {
	const group = name.startsWith('semantic ')
		? 'semantics'
		: name.startsWith('cancelled resolve')
			? 'cancellation'
			: name.startsWith('namespaced DateTime')
				? 'DateTime'
				: name.startsWith('namespaced project')
					? 'Widget'
					: 'startup';
	if (selection !== 'all' && selection !== group) return;
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
				if (window.__reviewResolveMode) {
					const add = worker.addEventListener.bind(worker),
						remove = worker.removeEventListener.bind(worker);
					const wrappers = new Map();
					trace.delivered = [];
					worker.addEventListener = (type, listener, ...options) => {
						if (type !== 'message')
							return add(type, listener, ...options);
						const wrapped = (event) => {
							const request = trace.sent.find(
								(m) => m?.id === event.data?.id && m?.method
							);
							let data = event.data;
							if (request?.method === 'textDocument/completion') {
								const items = Array.isArray(data.result)
									? data.result
									: data.result?.items;
								trace.globalImport = items?.find(
									(item) => item.detail === 'DateTime'
								)?.additionalTextEdits;
								if (
									window.__reviewResolveMode ===
										'resolve-only' &&
									items
								) {
									const transformed = items.map((item) =>
										item.detail === 'DateTime'
											? {
													...item,
													additionalTextEdits:
														undefined,
												}
											: item
									);
									data = {
										...data,
										result: Array.isArray(data.result)
											? transformed
											: {
													...data.result,
													items: transformed,
												},
									};
								}
							}
							if (
								request?.method === 'completionItem/resolve' &&
								request.params.data?.m === 'DateTime' &&
								window.__reviewResolveMode === 'resolve-only'
							)
								data = {
									...data,
									result: {
										...data.result,
										additionalTextEdits: trace.globalImport,
									},
								};
							const deliver = () => {
								trace.delivered.push({ request, data });
								listener(new MessageEvent('message', { data }));
							};
							if (request?.method === 'completionItem/resolve')
								setTimeout(deliver, 3_000);
							else deliver();
						};
						wrappers.set(listener, wrapped);
						return add(type, wrapped, ...options);
					};
					worker.removeEventListener = (type, listener, ...options) =>
						remove(
							type,
							wrappers.get(listener) ?? listener,
							...options
						);
				}
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
			status:
				error instanceof FixtureError ? 'invalid-fixture' : 'failed',
			error: String(error),
			acceptance: await page
				.evaluate(() => window.__reviewAcceptance)
				.catch(() => null),
			document: await text(page).catch(() => null),
			visibleDocumentation: await page
				.locator('.suggest-details:visible .docs')
				.allTextContents()
				.catch(() => []),
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
	await page.evaluate((source) => {
		window.__reviewFixture = source;
	}, source);
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
	const mac = await page
		.locator('.monaco-editor')
		.evaluate((e) => e.classList.contains('mac'));
	await page.keyboard.press(mac ? 'Meta+A' : 'Control+A');
	await page.keyboard.press('ArrowRight');
}

async function modelSnapshot(page) {
	return page.evaluate(() => {
		const monaco =
			window.monaco ?? window.require?.('vs/editor/editor.main');
		const editor = monaco?.editor
			.getEditors()
			.find((e) => e.hasTextFocus());
		if (!editor) return null;
		return {
			text: editor.getValue(),
			version: editor.getModel().getVersionId(),
			cursor: editor.getPosition(),
			selection: editor.getSelection(),
			fixture: window.__reviewFixture,
		};
	});
}
async function accept(page, label, suffix, options = {}) {
	await focusEnd(page);
	const before = await modelSnapshot(page);
	if (!before || before.text !== before.fixture)
		throw new FixtureError(
			`before-key model mismatch: ${JSON.stringify(before)}`
		);
	const lines = before.fixture.split('\n');
	const cursor = {
		lineNumber: lines.length,
		column: lines.at(-1).length + 1,
	};
	if (
		before.cursor.lineNumber !== cursor.lineNumber ||
		before.cursor.column !== cursor.column ||
		before.selection.startLineNumber !== cursor.lineNumber ||
		before.selection.startColumn !== cursor.column ||
		before.selection.endLineNumber !== cursor.lineNumber ||
		before.selection.endColumn !== cursor.column
	)
		throw new FixtureError(
			`before-key cursor/selection mismatch: ${JSON.stringify(before)}`
		);
	const expected = before.fixture + suffix;
	await page.keyboard.type(suffix, { delay: 40 });
	try {
		await expect
			.poll(async () => (await modelSnapshot(page))?.text)
			.toBe(expected);
		await expect.poll(() => text(page)).toBe(expected);
	} catch (error) {
		throw new FixtureError(
			`latest didChange does not match actual input: ${error}; observed=${JSON.stringify(await modelSnapshot(page))}`
		);
	}
	const after = await modelSnapshot(page);
	if (after.version <= before.version)
		throw new FixtureError('model version did not advance');
	const position = {
		line: cursor.lineNumber - 1,
		character: cursor.column - 1 + suffix.length,
	};
	await page.waitForFunction(
		(position) => {
			const worker = window.__reviewWorkers
				.filter(
					(w) =>
						!w.terminated &&
						w.sent.some((m) => m.type === 'phpantom:bootstrap')
				)
				.at(-1);
			const changeIndex = worker?.sent.findLastIndex(
				(m) => m.method === 'textDocument/didChange'
			);
			return worker?.sent.some(
				(m, i) =>
					i > changeIndex &&
					m.method === 'textDocument/completion' &&
					m.params.position.line === position.line &&
					m.params.position.character === position.character &&
					worker.received.some((r) => r.id === m.id)
			);
		},
		position,
		{ timeout: 10_000 }
	);
	const protocol = await page.evaluate((position) => {
		const worker = window.__reviewWorkers
			.filter(
				(w) =>
					!w.terminated &&
					w.sent.some((m) => m.type === 'phpantom:bootstrap')
			)
			.at(-1);
		const change = worker.sent
			.filter((m) => m.method === 'textDocument/didChange')
			.at(-1);
		const request = worker.sent
			.filter(
				(m) =>
					m.method === 'textDocument/completion' &&
					m.params.position.line === position.line &&
					m.params.position.character === position.character
			)
			.at(-1);
		return {
			workerId: worker.id,
			change,
			request,
			response: worker.received.find((m) => m.id === request.id),
		};
	}, position);
	const rows = page.locator('.suggest-widget .monaco-list-row');
	const matching = rows.filter({
		has: page.locator('.label-name').filter({
			hasText: new RegExp(
				`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
			),
		}),
	});
	await matching.first().waitFor({ state: 'visible' });
	const displayed = await rows.allTextContents();
	const identities = await matching.evaluateAll((elements) =>
		elements.map((e) => ({
			text: e.textContent,
			aria: e.getAttribute('aria-label'),
			html: e.outerHTML,
			detail: e.querySelector('.details-label')?.textContent,
		}))
	);
	await page.evaluate(
		(value) => {
			window.__reviewAcceptance = value;
		},
		{ before, after, protocol, displayed, identities }
	);
	let row = matching.first();
	if (label === 'DateTime' && identities.length > 1) {
		const globalIndex = identities.findIndex(
			(e) => e.detail?.trim() === 'DateTime'
		);
		if (globalIndex < 0)
			throw new FixtureError(
				`global DateTime row is ambiguous: ${JSON.stringify(identities)}`
			);
		row = matching.nth(globalIndex);
	}
	const expectedFqn =
		options.fqn ??
		(label === 'DateTime'
			? 'DateTime'
			: label === 'Widget'
				? 'Foo\\Widget'
				: undefined);
	let acceptedResolve;
	if (expectedFqn) {
		const targetIndex = await row.getAttribute('data-index');
		if (targetIndex === null)
			throw new FixtureError('candidate row has no list index');
		for (let step = 0; step <= (await rows.count()); step++) {
			const focused = await page
				.locator('.suggest-widget .monaco-list-row.focused')
				.getAttribute('data-index');
			if (focused === targetIndex) break;
			await page.keyboard.press('ArrowDown');
		}
		if (
			(await page
				.locator('.suggest-widget .monaco-list-row.focused')
				.getAttribute('data-index')) !== targetIndex
		)
			throw new FixtureError('qualified candidate could not be focused');
		await page.waitForFunction((fqn) => {
			const worker = window.__reviewWorkers
				.filter(
					(w) =>
						!w.terminated &&
						w.sent.some((m) => m.type === 'phpantom:bootstrap')
				)
				.at(-1);
			return worker.sent.some(
				(m) =>
					m.method === 'completionItem/resolve' &&
					m.params.data?.m === fqn &&
					worker.received.some((r) => r.id === m.id)
			);
		}, expectedFqn);
		acceptedResolve = await page.evaluate((fqn) => {
			const worker = window.__reviewWorkers
				.filter(
					(w) =>
						!w.terminated &&
						w.sent.some((m) => m.type === 'phpantom:bootstrap')
				)
				.at(-1);
			const request = worker.sent
				.filter(
					(m) =>
						m.method === 'completionItem/resolve' &&
						m.params.data?.m === fqn
				)
				.at(-1);
			return {
				request,
				response: worker.received.find((m) => m.id === request.id),
			};
		}, expectedFqn);
		expect(acceptedResolve.request.params.data.m).toBe(expectedFqn);
		if (!options.fqn)
			expect(acceptedResolve.request.params.detail).toBe(expectedFqn);
		if (options.docs) {
			// Expanding an already naturally-opened candidate is a documentation action.
			// It does not invoke completion or change the chosen candidate.
			await page.evaluate(() => {
				const monaco =
					window.monaco ?? window.require('vs/editor/editor.main');
				monaco.editor
					.getEditors()[0]
					.trigger('keyboard', 'toggleSuggestionDetails', {});
			});
			const docs = page.locator('.suggest-details:visible .docs');
			await expect(docs).toBeVisible();
			for (const marker of options.docs.present)
				await expect(docs).toContainText(marker);
			for (const marker of options.docs.absent)
				await expect(docs).not.toContainText(marker);
			acceptedResolve.visibleDocumentation = await docs.innerText();
		}
		await page.keyboard.press('Enter');
	} else {
		await row.click();
	}
	await page.keyboard.press('Escape');
	return {
		acceptedResolve,
		beforeKey: before,
		afterKey: after,
		protocol,
		displayed,
		documentAfterAcceptance: await text(page),
	};
}

async function selectVersion(page, version) {
	await page.locator('#select-input-php').fill(version);
	await page.keyboard.press('Tab');
	await expect(page).toHaveURL(
		new RegExp(`[?&]v=${version.replace('.', '\\.')}(?:&|$)`)
	);
}
try {
	const shadow =
		'<?php\nnamespace App;\n/** RELEASE_USER_DOC */\nfunction str_contains(string $ownOnly): bool { return true; }\n';
	for (const fixture of [
		{
			name: 'unique user function',
			source: '<?php\nnamespace App;\n/** RELEASE_UNIQUE_DOC */\nfunction audit_local(string $ownOnly): bool { return true; }\naudit_lo',
			suffix: 'c',
			label: 'audit_local($ownOnly)',
			expectedAcceptedDocument:
				'<?php\nnamespace App;\n/** RELEASE_UNIQUE_DOC */\nfunction audit_local(string $ownOnly): bool { return true; }\naudit_local($ownOnly)',
			fqn: 'App\\audit_local',
			docs: {
				present: ['RELEASE_UNIQUE_DOC'],
				absent: ['RELEASE_USER_DOC'],
			},
		},
		{
			name: 'same-name user function',
			source: shadow + 'str_con',
			suffix: 't',
			label: 'str_contains($ownOnly)',
			fqn: 'App\\str_contains',
			expectedAcceptedDocument: shadow + 'str_contains($ownOnly)',
			docs: {
				present: ['RELEASE_USER_DOC'],
				absent: ['$haystack', '$needle'],
			},
		},
		{
			name: 'global builtin function',
			source: shadow + 'str_con',
			suffix: 't',
			label: 'str_contains',
			fqn: 'str_contains',
			expectedAcceptedDocument: shadow + '\\str_contains()',
			docs: {
				present: ['$haystack', '$needle'],
				absent: ['RELEASE_USER_DOC', '$ownOnly'],
			},
		},
	]) {
		await run(
			'semantic visible docs identify ' + fixture.name,
			async (page) => {
				await open(page, fixture.source);
				await ready(page, '8.5');
				const acceptance = await accept(
					page,
					fixture.label,
					fixture.suffix,
					fixture
				);
				expect({
					document: await text(page),
					selectedFqn:
						acceptance.acceptedResolve.request.params.data.m,
				}).toEqual({
					document: fixture.expectedAcceptedDocument,
					selectedFqn: fixture.fqn,
				});
				return { fixture, acceptance, document: await text(page) };
			}
		);
	}
	for (const fixture of [
		{
			name: 'global builtin',
			label: 'str_contains',
			fqn: 'str_contains',
			arguments: "'a', 'z'",
			output: 'false',
			expectedAcceptedDocument: shadow + 'var_export(\\str_contains()',
			expectedExecutionDocument:
				shadow + "var_export(\\str_contains('a', 'z'));",
		},
		{
			name: 'namespace user',
			label: 'str_contains($ownOnly)',
			fqn: 'App\\str_contains',
			arguments: "'a'",
			output: 'true',
			expectedAcceptedDocument:
				shadow + 'var_export(str_contains($ownOnly)',
			expectedExecutionDocument:
				shadow + "var_export(str_contains('a'));",
		},
	]) {
		await run(
			'semantic selected function executes ' + fixture.name,
			async (page) => {
				await open(page, shadow + 'var_export(str_con');
				await ready(page, '8.5');
				const acceptance = await accept(page, fixture.label, 't', {
					fqn: fixture.fqn,
				});
				const acceptedDocument = await text(page);
				// Only fill arguments and finish the outer var_export call; preserve the inserted symbol/imports.
				await page.evaluate((args) => {
					const monaco =
						window.monaco ??
						window.require('vs/editor/editor.main');
					const editor = monaco.editor.getEditors()[0];
					const model = editor.getModel();
					const lineNumber = model.getLineCount(),
						line = model.getLineContent(lineNumber);
					const open = line.lastIndexOf('('),
						close = line.lastIndexOf(')');
					if (open < 0 || close < open)
						throw new Error(
							'accepted candidate did not insert a function call'
						);
					editor.executeEdits('argument-fixture', [
						{
							range: {
								startLineNumber: lineNumber,
								endLineNumber: lineNumber,
								startColumn: open + 2,
								endColumn: close + 1,
							},
							text: args,
						},
						{
							range: {
								startLineNumber: lineNumber,
								endLineNumber: lineNumber,
								startColumn: line.length + 1,
								endColumn: line.length + 1,
							},
							text: ');',
						},
					]);
				}, fixture.arguments);
				const finalDocument = await page.evaluate(() =>
					(
						window.monaco ?? window.require('vs/editor/editor.main')
					).editor
						.getEditors()[0]
						.getValue()
				);
				await expect.poll(() => text(page)).toBe(finalDocument);
				const preview = page.getByTestId('preview-console');
				await expect(preview).toHaveText(/^(true|false)$/);
				expect({
					acceptedDocument,
					finalDocument,
					execution: await preview.innerText(),
					selectedFqn:
						acceptance.acceptedResolve.request.params.data.m,
				}).toEqual({
					acceptedDocument: fixture.expectedAcceptedDocument,
					finalDocument: fixture.expectedExecutionDocument,
					execution: fixture.output,
					selectedFqn: fixture.fqn,
				});
				return {
					fixture,
					acceptance,
					acceptedDocument,
					finalDocument,
					execution: await preview.innerText(),
				};
			}
		);
	}
	for (const mode of ['initial', 'resolve-only']) {
		await run(
			`cancelled resolve ${mode} refocus preserves global import`,
			async (page) => {
				await page.addInitScript((mode) => {
					window.__reviewResolveMode = mode;
				}, mode);
				await open(page, '<?php\nnamespace App;\nnew DateT');
				await ready(page, '8.5');
				await focusEnd(page);
				const before = await modelSnapshot(page);
				if (
					before?.text !== '<?php\nnamespace App;\nnew DateT' ||
					before.cursor.lineNumber !== 3 ||
					before.cursor.column !== 10
				)
					throw new FixtureError(
						`cancellation fixture cursor/text mismatch: ${JSON.stringify(before)}`
					);
				await page.keyboard.type('i');
				await expect
					.poll(() => text(page))
					.toBe('<?php\nnamespace App;\nnew DateTi');
				const rows = page.locator('.suggest-widget .monaco-list-row');
				await rows.first().waitFor();
				const identities = await rows.evaluateAll((es) =>
					es.map((e) => ({
						index: e.getAttribute('data-index'),
						label: e.querySelector('.label-name')?.textContent,
						detail: e.querySelector('.details-label')?.textContent,
					}))
				);
				const wanted = identities.find(
					(e) =>
						e.label === 'DateTime' &&
						e.detail?.trim() === 'DateTime'
				);
				if (!wanted)
					throw new FixtureError(
						`no global DateTime: ${JSON.stringify(identities)}`
					);
				for (let i = 0; i <= identities.length; i++) {
					if (
						(await page
							.locator('.suggest-widget .monaco-list-row.focused')
							.getAttribute('data-index')) === wanted.index
					)
						break;
					await page.keyboard.press('ArrowDown');
				}
				await page.waitForFunction(() =>
					window.__reviewWorkers.some((w) =>
						w.sent.some(
							(m) =>
								m?.method === 'completionItem/resolve' &&
								m.params.data?.m === 'DateTime'
						)
					)
				);
				await page.keyboard.press('ArrowDown');
				await expect(
					page.locator('.suggest-widget .monaco-list-row.focused')
				).not.toHaveAttribute('data-index', wanted.index);
				await page.keyboard.press('ArrowUp');
				await expect(
					page.locator('.suggest-widget .monaco-list-row.focused')
				).toHaveAttribute('data-index', wanted.index);
				await page.waitForFunction(() =>
					window.__reviewWorkers.some(
						(w) =>
							w.sent.filter(
								(m) =>
									m?.method === 'completionItem/resolve' &&
									m.params.data?.m === 'DateTime'
							).length >= 2
					)
				);
				const refocus = await page.evaluate(() => {
					const worker = window.__reviewWorkers.find((w) =>
						w.sent.some((m) => m?.type === 'phpantom:bootstrap')
					);
					return {
						requests: worker.sent.filter(
							(m) =>
								m?.method === 'completionItem/resolve' &&
								m.params.data?.m === 'DateTime'
						),
						deliveries: worker.delivered.filter(
							(m) =>
								m.request?.method ===
									'completionItem/resolve' &&
								m.request.params.data?.m === 'DateTime'
						),
						initial: worker.delivered.find(
							(m) =>
								m.request?.method === 'textDocument/completion'
						),
					};
				});
				if (refocus.deliveries.length !== 0)
					throw new FixtureError(
						'three-second response arrived before away/back fixture completed'
					);
				expect(
					refocus.requests.map((m) => ({
						symbol: m.params.data.m,
						detail: m.params.detail,
					}))
				).toEqual([
					{ symbol: 'DateTime', detail: 'DateTime' },
					{ symbol: 'DateTime', detail: 'DateTime' },
				]);
				if (mode === 'resolve-only') {
					const items = Array.isArray(refocus.initial.data.result)
						? refocus.initial.data.result
						: refocus.initial.data.result.items;
					expect(
						items.find((item) => item.detail === 'DateTime')
							.additionalTextEdits
					).toBeUndefined();
					await page.waitForFunction(
						(id) =>
							window.__reviewWorkers.some((w) =>
								w.delivered?.some(
									(entry) => entry.data.id === id
								)
							),
						refocus.requests.at(-1).id
					);
				}
				await page.keyboard.press('Enter');
				const accepted =
					'<?php\nnamespace App;\n\nuse DateTime;\nnew DateTime()';
				await expect.poll(() => text(page)).toBe(accepted);
				// All original/second delayed replies must finish without reapplying imports.
				await page.waitForFunction(() =>
					window.__reviewWorkers.some(
						(w) =>
							w.delivered?.filter(
								(m) =>
									m.request?.method ===
										'completionItem/resolve' &&
									m.request.params.data?.m === 'DateTime'
							).length >= 2
					)
				);
				await expect.poll(() => text(page)).toBe(accepted);
				await page.keyboard.type('; echo get_class(new DateTime());');
				await expect(page.getByTestId('preview-console')).toHaveText(
					'DateTime'
				);
				return {
					fixtureMode: mode,
					delayResolveMs: 3_000,
					beforeKey: before,
					identities,
					refocus,
					document: await text(page),
					execution: await page
						.getByTestId('preview-console')
						.textContent(),
					workers: await workers(page),
				};
			}
		);
	}

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
	invalidFixture: report.cases.filter((c) => c.status === 'invalid-fixture')
		.length,
};
await persist();
console.log(JSON.stringify(report.summary));
if (report.summary.failed || report.summary.invalidFixture)
	process.exitCode = 1;
