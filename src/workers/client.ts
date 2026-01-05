// Client-side Web Worker integration
import { useEffect, useState } from 'react';
import { Version } from '../php-wasm/php';
import type { PHPResultMessage, RunPHPMessage } from './types';
import phpWorker from './php-worker?worker';

type PHPState = {
	requestId?: string;
	executionId?: NodeJS.Timeout;
	worker?: Worker;
	result: string;
	error?: string;
};

const codeState: PHPState = {
	worker: undefined,
	result: '',
	error: undefined,
};

// Convert code to PHP code
export function convertCodeToPhpPlayground(code: string): string {
	const phpPrefixPattern = /^<\?(php)?\s+/g;
	const hasPhpPrefix = code.match(phpPrefixPattern);
	let phpCode = code.replace(phpPrefixPattern, '');
	// Add PHP tag if not exists
	if (!hasPhpPrefix) {
		phpCode = '?>' + phpCode;
	}
	return phpCode;
}

// Initialize Web Worker
function initializeWorker() {
	if (codeState.worker) {
		return;
	}

	const worker = new phpWorker();

	// Listen for messages from worker
	worker.onmessage = (event: MessageEvent<PHPResultMessage>) => {
		const phpResult = event.data;
		if (phpResult.requestId !== codeState.requestId) {
			console.warn('Received message for unknown request:', phpResult);
			return;
		}
		codeState.result = phpResult.result;
		codeState.error = phpResult.error;
	};

	worker.onerror = (error) => {
		codeState.error = error.message;
	};

	codeState.worker = worker;
	console.log('Initialized worker:', codeState.worker);
}

// Clean up worker
function terminateWorker(): void {
	if (codeState.worker) {
		codeState.worker.terminate();
		codeState.worker = undefined;
	}
	if (codeState.executionId) {
		clearInterval(codeState.executionId);
		codeState.executionId = undefined;
		codeState.requestId = undefined;
	}

	codeState.result = '';
	codeState.error = undefined;
}

export async function simple(callback: (worker: Worker) => void) {
	initializeWorker();
	if (codeState.worker) {
		codeState.worker.postMessage('hello');
		callback(codeState.worker);
	}
}

export function runPHPInWorker(
	version: Version,
	code: string
): Promise<string> {
	return new Promise((resolve, reject) => {
		try {
			terminateWorker();
			initializeWorker();
			codeState.result = '';
			codeState.error = undefined;

			// Start monitoring interval (approx 60 FPS, ~16ms)
			// Use intervalId as requestId (browser setInterval returns number)
			const requestId = `id-${Date.now()}-${Math.random()}`;
			const intervalId = setInterval(() => {
				// Check if code has changed
				if (codeState.error) {
					reject(new Error(codeState.error));
					return;
				}
				if (codeState.result) {
					resolve(codeState.result);
				}
			}, 1000 / 30);

			// Use intervalId as requestId
			codeState.requestId = requestId;
			codeState.executionId = intervalId;
			const request: RunPHPMessage = {
				requestId: requestId,
				version: version,
				code: code,
			};
			if (codeState.worker) {
				codeState.worker.postMessage(request);
			}
		} catch (error) {
			reject(error);
		}
	});
}

export function usePHP(version: Version, code: string): [boolean, string] {
	const [loading, setLoading] = useState<boolean>(false);
	const [internalCode, setInternalCode] = useState<string>('');
	const [result, setResult] = useState<string>('');
	const [currentVersion, setCurrentVersion] = useState<Version>(version);

	const phpCode = convertCodeToPhpPlayground(code);

	useEffect(
		function () {
			if (currentVersion !== version) {
				setLoading(true);
				setCurrentVersion(version);
				setInternalCode('');
				setResult('');
				return;
			}

			if (internalCode !== phpCode) {
				setLoading(true);
				setInternalCode(phpCode);
				return;
			}

			if (!loading) {
				return;
			}

			if (internalCode === '') {
				setResult('empty data');
				setLoading(false);
				return;
			}

			// Start execution
			(async function () {
				try {
					const info = await runPHPInWorker(version, internalCode);
					setResult(info);
					setLoading(false);
				} catch (error) {
					const errorMessage =
						error instanceof Error ? error.message : String(error);
					setResult(`Error: ${errorMessage}`);
					setLoading(false);
				} finally {
					terminateWorker();
				}
			})();

			// Cleanup function
			return () => {};
		},
		[code, internalCode, loading, version, currentVersion, phpCode]
	);

	return [loading, result];
}
