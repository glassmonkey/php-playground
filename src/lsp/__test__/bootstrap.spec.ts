// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Version } from '../../php-wasm/php';

const loader = vi.hoisted(() => ({ compile: vi.fn() }));
vi.mock('../phpantom/wasm-module-cache', () => ({
	compiledPhpantomModule: loader.compile,
}));
import { createWorker } from '../phpantom';

describe('PHPantom worker bootstrap', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it.each(['8.4', '8.5'] as Version[])(
		'waits beyond the RPC deadline before allocating the PHP %s worker',
		async (phpVersion) => {
			// Arrange
			vi.useFakeTimers();
			const module = {} as WebAssembly.Module;
			loader.compile.mockImplementation(
				() =>
					new Promise((resolve) =>
						setTimeout(() => resolve(module), 16_000)
					)
			);
			const worker = { postMessage: vi.fn(), terminate: vi.fn() };
			const construct = vi.fn(function () {
				return worker;
			});
			vi.stubGlobal('Worker', construct);
			const controller = new AbortController();
			// Act
			const pending = createWorker(phpVersion, {
				signal: controller.signal,
			});
			await vi.advanceTimersByTimeAsync(15_001);
			const beforeReady = construct.mock.calls.length;
			await vi.advanceTimersByTimeAsync(999);
			const got = await pending;
			// Assert
			expect({
				worker: got,
				beforeReady,
				created: construct.mock.calls.length,
				bootstrap: worker.postMessage.mock.calls,
			}).toEqual({
				worker,
				beforeReady: 0,
				created: 1,
				bootstrap: [
					[{ type: 'phpantom:bootstrap', phpVersion, module }],
				],
			});
		}
	);

	it.each(['off', 'version switch'])(
		'does not create a zombie worker when %s cancels a pending load',
		async () => {
			// Arrange
			let finish!: (module: WebAssembly.Module) => void;
			loader.compile.mockImplementation(
				() =>
					new Promise((resolve) => {
						finish = resolve;
					})
			);
			const construct = vi.fn();
			vi.stubGlobal('Worker', construct);
			const controller = new AbortController();
			// Act
			const pending = createWorker('8.5', {
				signal: controller.signal,
			}).catch((error) => error);
			controller.abort();
			finish({} as WebAssembly.Module);
			const got = await pending;
			// Assert
			expect({ error: got, workers: construct.mock.calls }).toEqual({
				error: controller.signal.reason,
				workers: [],
			});
		}
	);

	it('does not fetch or allocate after an already-cancelled request', async () => {
		// Arrange
		const construct = vi.fn();
		vi.stubGlobal('Worker', construct);
		const controller = new AbortController();
		controller.abort();
		// Act
		const got = await createWorker('8.5', {
			signal: controller.signal,
		}).catch((error) => error);
		// Assert
		expect({
			error: got,
			loads: loader.compile.mock.calls,
			workers: construct.mock.calls,
		}).toEqual({ error: controller.signal.reason, loads: [], workers: [] });
	});

	it('terminates a newly allocated worker when bootstrap delivery fails', async () => {
		// Arrange
		loader.compile.mockResolvedValue({});
		const failure = new Error('bootstrap delivery failed');
		const worker = {
			postMessage: vi.fn(() => {
				throw failure;
			}),
			terminate: vi.fn(),
		};
		vi.stubGlobal(
			'Worker',
			vi.fn(function () {
				return worker;
			})
		);
		const controller = new AbortController();
		// Act
		const got = await createWorker('8.5', {
			signal: controller.signal,
		}).catch((error) => error);
		// Assert
		expect({
			error: got,
			terminations: worker.terminate.mock.calls,
		}).toEqual({ error: failure, terminations: [[]] });
	});
});
