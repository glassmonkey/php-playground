/** Create a module worker that runs PHPantom's WASI LSP reactor. */
export function createWorker(): Worker {
	return new Worker(new URL('./worker.ts', import.meta.url), {
		type: 'module',
	});
}
