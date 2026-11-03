import { expect, test } from '@playwright/test';
import { versions } from '../src/php-wasm/php';

test.setTimeout(30_000);

type LazyFileModule = {
	locateFile: () => string;
	onRuntimeInitialized: () => void;
	onAbort: (reason: string) => void;
	FS?: {
		createLazyFile(
			parent: string,
			name: string,
			url: string,
			canRead: boolean,
			canWrite: boolean
		): unknown;
	};
};

for (const version of versions) {
	test(`PHP ${version}: web runtime rejects Worker-only lazy file XHR`, async ({
		page,
	}) => {
		await page.goto('/');
		const got = await page.evaluate(async (v) => {
			const { default: load } = await import(
				`/src/wasm-assets/php-${v}.js`
			);
			return new Promise((resolve) => {
				const module: LazyFileModule = {
					locateFile: () => `/php-${v}.wasm`,
					onRuntimeInitialized() {
						try {
							module.FS!.createLazyFile(
								'/tmp',
								'lazy.txt',
								'/e2e/fixtures/wasm-lazy.txt',
								true,
								false
							);
							resolve('unexpected success');
						} catch (error) {
							resolve(String(error));
						}
					},
					onAbort(reason: string) {
						resolve(reason);
					},
				};
				load('WEB', module);
			});
		}, version);
		expect(got).toBe(
			'Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc'
		);
	});

	test(`PHP ${version}: real Worker creates and reads a lazy file`, async ({
		page,
	}) => {
		await page.goto('/');
		const got = await page.evaluate(async (v) => {
			const source = `
import load from '${location.origin}/src/wasm-assets/php-${v}.js';
self.onunhandledrejection = (event) => self.postMessage({ error: String(event.reason) });
const module = { locateFile: () => '${location.origin}/php-${v}.wasm', onRuntimeInitialized() {
  try {
    module.FS.createLazyFile('/tmp', 'lazy.txt', '${location.origin}/e2e/fixtures/wasm-lazy.txt', true, false);
    self.postMessage({ contents: module.FS.readFile('/tmp/lazy.txt', { encoding: 'utf8' }) });
  } catch (error) { self.postMessage({ error: String(error) }); }
}, onAbort(reason) { self.postMessage({ error: String(reason) }); } };
load('WORKER', module);
`;
			const url = URL.createObjectURL(
				new Blob([source], { type: 'text/javascript' })
			);
			const worker = new Worker(url, { type: 'module' });
			try {
				return await new Promise((resolve, reject) => {
					worker.onmessage = (event) => resolve(event.data);
					worker.onerror = (event) =>
						reject(new Error(event.message));
				});
			} finally {
				worker.terminate();
				URL.revokeObjectURL(url);
			}
		}, version);
		const want = { contents: 'lazy-file-worker-ok\n' };
		expect(got).toEqual(want);
	});
}
