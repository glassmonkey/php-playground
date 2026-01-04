/// <reference lib="webworker" />

import type { PHPResultMessage, RunPHPMessage } from './types';
import { type PHP, type Version } from '../php-wasm/php';
import {initPHP, runPHP} from "./php";


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
self.addEventListener('message', async (event: MessageEvent<RunPHPMessage>) => {
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
});

export default {}