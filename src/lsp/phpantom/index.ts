import type { Version } from '../../php-wasm/php';
import type { PhpantomWorkerBootstrapMessage } from './artifact-registry';
import { compiledPhpantomModule } from './wasm-module-cache';

/** Create a module worker that runs PHPantom's selected-version WASI LSP reactor. */
export function createWorker(phpVersion: Version): Worker {
	const worker = new Worker(new URL('./worker.ts', import.meta.url), {
		type: 'module',
	});
	void compiledPhpantomModule(phpVersion).then(
		(module) => {
			const message: PhpantomWorkerBootstrapMessage = {
				type: 'phpantom:bootstrap',
				phpVersion,
				module,
			};
			worker.postMessage(message);
		},
		(error: unknown) => {
			const message: PhpantomWorkerBootstrapMessage = {
				type: 'phpantom:bootstrap',
				phpVersion,
				error: error instanceof Error ? error.message : String(error),
			};
			worker.postMessage(message);
		}
	);
	return worker;
}
