/// <reference lib="webworker" />

import type { PHPResultMessage, RunPHPMessage } from './types';
import {
	type PHP,
	PHPLoaderModule,
	startPHP,
	type Version,
} from '../php-wasm/php';

const phpWasmLoaders = import.meta.glob('../wasm-assets/php-*.js', {
	eager: true,
}) as Record<string, PHPLoaderModule>;

function loadPHPLoaderModule(v: Version): PHPLoaderModule {
	const loader = phpWasmLoaders[`../wasm-assets/php-${v}.js`];
	if (!loader) {
		throw Error(`PHP ${v} assets not found.`);
	}
	return loader;
}

export async function initPHP(v: Version): Promise<PHP> {
	const PHPLoaderModule = loadPHPLoaderModule(v);
	return startPHP(v, PHPLoaderModule, 'WORKER', {
		locateFile: (path: string) => {
			const cleanPath = path.split('?')[0];
			// Always load WASM files from the root assets directory
			// This ensures correct paths in both dev and production environments
			if (cleanPath.endsWith('.wasm')) {
				return `/${path}`;
			}
			return path;
		},
	});
}

export async function runPHP(php: PHP, code: string): Promise<string> {
	const output = php.run({ code });
	return new TextDecoder().decode(output.body);
}

// PHP instances cache
const phpInstances = new Map<Version, PHP>();

async function getOrInitPHP(version: Version): Promise<PHP> {
	if (phpInstances.has(version)) {
		return phpInstances.get(version)!;
	}

	const php = await initPHP(version);
	phpInstances.set(version, php);
	return php;
}

// Handle messages from main thread (only in worker context)

self.onmessage = async (event: MessageEvent<RunPHPMessage>) => {
	const phpMessage = event.data;

	try {
		const php = await getOrInitPHP(phpMessage.version);
		const result = await runPHP(php, phpMessage.code);

		const resultMessage: PHPResultMessage = {
			requestId: phpMessage.requestId,
			result: result,
		};
		self.postMessage(resultMessage);
	} catch (error) {
		const errorMessage: PHPResultMessage = {
			requestId: phpMessage.requestId,
			result: '',
			error: error instanceof Error ? error.message : String(error),
		};
		self.postMessage(errorMessage);
	}
};

export default {};
