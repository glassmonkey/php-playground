/** Creates a Phpactor backed LSP worker. */
export function createWorker(): Worker {
	return new Worker(new URL('./phpactor-worker.ts', import.meta.url), {
		type: 'module',
	});
}
