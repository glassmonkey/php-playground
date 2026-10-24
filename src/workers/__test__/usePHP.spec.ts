// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement, useLayoutEffect, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Version } from '../../php-wasm/php';
import type { PHPResultMessage, RunPHPMessage } from '../types';
import { usePHP } from '../client';

type TestWorker = {
	onmessage: ((event: MessageEvent<PHPResultMessage>) => void) | null;
	onerror: ((event: ErrorEvent) => void) | null;
	messages: RunPHPMessage[];
	terminated: boolean;
	postMessage(message: RunPHPMessage): void;
	terminate(): void;
	reply(result: string): void;
	fail(message: string): void;
};

type TestInterval = {
	handle: ReturnType<typeof setInterval>;
	tick(): void;
	cleared: boolean;
	intervalMs: number;
};

describe('usePHP execution changes', () => {
	let workers: TestWorker[];
	let intervals: TestInterval[];
	let nextLayoutAction: (() => void) | undefined;

	beforeEach(() => {
		workers = [];
		intervals = [];
		nextLayoutAction = undefined;

		class MockWorker {
			onmessage: TestWorker['onmessage'] = null;
			onerror: TestWorker['onerror'] = null;
			messages: RunPHPMessage[] = [];
			terminated = false;

			constructor() {
				workers.push(this);
			}

			postMessage(message: RunPHPMessage) {
				this.messages.push(message);
			}

			terminate() {
				this.terminated = true;
			}

			reply(result: string) {
				const request = this.messages[0];
				this.onmessage?.(
					new MessageEvent('message', {
						data: { requestId: request.requestId, result },
					})
				);
			}

			fail(message: string) {
				this.onerror?.(new ErrorEvent('error', { message }));
			}
		}

		vi.stubGlobal('Worker', MockWorker);
		vi.spyOn(globalThis, 'setInterval').mockImplementation(
			((callback: () => void, intervalMs?: number) => {
				const interval = {
					handle: undefined as unknown as ReturnType<typeof setInterval>,
					cleared: false,
					intervalMs: intervalMs ?? 0,
					tick: callback,
				};
				interval.handle = interval as unknown as ReturnType<typeof setInterval>;
				intervals.push(interval);
				return interval.handle;
			}) as typeof setInterval
		);
		vi.spyOn(globalThis, 'clearInterval').mockImplementation(
			((handle: ReturnType<typeof setInterval>) => {
				const interval = intervals.find((candidate) => candidate.handle === handle);
				if (interval) {
					interval.cleared = true;
				}
			}) as typeof clearInterval
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	function LayoutBoundary({ children }: { children: ReactNode }) {
		useLayoutEffect(() => {
			const action = nextLayoutAction;
			nextLayoutAction = undefined;
			action?.();
		});
		return createElement('div', null, children);
	}

	// Keep the wrapper tied to React's real commit/layout phase while the hook remains public.
	const wrapper = ({ children }: { children: ReactNode }) =>
		createElement(LayoutBoundary, null, children);

	it.each(['result', 'error'] as const)(
		'ignores an old %s completion after a new version and code run starts',
		async (oldCompletion) => {
			const { result, rerender, unmount } = renderHook(
				({ version, code }: { version: Version; code: string }) =>
					usePHP(version, code),
				{
					initialProps: { version: '8.5' as Version, code: 'echo old;' },
					wrapper,
				}
			);
			const [oldWorker] = workers;
			const [oldInterval] = intervals;

			expect(oldWorker.messages[0]).toMatchObject({
				version: '8.5',
				code: '?>echo old;',
			});
			expect(oldInterval.intervalMs).toBeCloseTo(1000 / 30);

			nextLayoutAction = () => {
				if (oldCompletion === 'result') {
					oldWorker.reply('stale PHP Version 8.5');
				} else {
					oldWorker.fail('stale worker failure');
				}
				oldInterval.tick();
			};

			await act(async () => {
				rerender({ version: '8.1' as Version, code: 'echo new;' });
				await Promise.resolve();
			});

			const newWorker = workers[1];
			const newInterval = intervals[1];
			expect(newWorker.messages[0]).toMatchObject({
				version: '8.1',
				code: '?>echo new;',
			});
			expect(newWorker.terminated).toBe(false);
			expect(result.current).toEqual([true, '']);

			await act(async () => {
				newWorker.reply('fresh PHP Version 8.1');
				newInterval.tick();
				await Promise.resolve();
			});

			expect(result.current).toEqual([false, 'fresh PHP Version 8.1']);
			expect(newWorker.terminated).toBe(true);
			unmount();
		}
	);

	it('invalidates a pending completion on unmount before another public hook run', async () => {
		const first = renderHook(() => usePHP('8.5', 'echo first;'), { wrapper });
		const [oldWorker] = workers;
		const [oldInterval] = intervals;

		first.unmount();
		expect(oldWorker.terminated).toBe(true);

		const second = renderHook(() => usePHP('8.1', 'echo second;'), { wrapper });
		const newWorker = workers[1];
		const newInterval = intervals[1];
		expect(newWorker.messages[0]).toMatchObject({
			version: '8.1',
			code: '?>echo second;',
		});

		await act(async () => {
			oldWorker.reply('late result after unmount');
			oldInterval.tick();
			await Promise.resolve();
		});
		expect(newWorker.terminated).toBe(false);
		expect(second.result.current).toEqual([true, '']);

		await act(async () => {
			newWorker.reply('fresh second result');
			newInterval.tick();
			await Promise.resolve();
		});
		expect(second.result.current).toEqual([false, 'fresh second result']);
		second.unmount();
	});
});
