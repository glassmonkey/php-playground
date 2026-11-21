import type { Version } from '../../php-wasm/php';
import type { PhpantomWorkerBootstrapMessage } from './artifact-registry';
import { compiledPhpantomModule } from './wasm-module-cache';

/** Verify/compile before allocating a Worker or starting its RPC clock. */
export async function createWorker(
	phpVersion: Version,
	{ signal }: { signal: AbortSignal }
): Promise<Worker> {
	signal.throwIfAborted();
	let cancel: () => void = () => undefined;
	const cancelled = new Promise<never>((_, reject) => {
		cancel = () => reject(signal.reason);
		signal.addEventListener('abort', cancel, { once: true });
	});
	let module: WebAssembly.Module;
	try {
		module = await Promise.race([
			compiledPhpantomModule(phpVersion),
			cancelled,
		]);
	} finally {
		signal.removeEventListener('abort', cancel);
	}
	signal.throwIfAborted();
	const worker = new Worker(new URL('./worker.ts', import.meta.url), {
		type: 'module',
	});
	try {
		const message: PhpantomWorkerBootstrapMessage = {
			type: 'phpantom:bootstrap',
			phpVersion,
			module,
		};
		worker.postMessage(message);
		return worker;
	} catch (error) {
		worker.terminate();
		throw error;
	}
}
