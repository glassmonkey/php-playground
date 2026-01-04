// Client-side Service Worker integration
import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import {defaultVersion, PHPRequest, Version} from '../php-wasm/php';
import type { PHPResultMessage, RunPHPMessage } from './types';

type PHPState = {
	executionId?: NodeJS.Timeout;
	code: string;
	version: Version;
	ready: boolean;
	result: string;
	error?: string;
}

const codeState: PHPState = {
	executionId: undefined,
	code: '',
	version: defaultVersion,
	ready: false,
	result: '',
	error: undefined
}

async function clearExecution() {
	if (codeState.executionId) {
		clearInterval(codeState.executionId);
		codeState.executionId = undefined;
	}
	codeState.result = '';
	codeState.error = undefined;
}

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


export async function registerServiceWorker(): Promise<void> {
	if (!('serviceWorker' in navigator)) {
		console.warn('Service Worker is not supported in this browser');
		return;
	}

	console.log('Registering Service Worker...');

	registerSW({
		onRegisteredSW(_swScriptUrl, registration) {
			console.log('Service Worker registered with scope:', registration?.scope);
			registration?.update()
			console.log('Service Worker:', registration)
		},
		onRegisterError(error) {
			console.error('Service Worker registration failed:', error);
		},
		immediate: true,
	});

	// Only register message listener once
	if (!codeState.ready) {
		console.log('Registering message listener...');
		navigator.serviceWorker.addEventListener('message', (event: MessageEvent<PHPResultMessage>) => {
			const phpResult = event.data;
			if (phpResult.requestId !== codeState.executionId) {
				console.warn('Received message for unknown request:', phpResult);
				return;
			}
			codeState.result = phpResult.result;
			codeState.error = phpResult.error;
		});
		codeState.ready = true;
	}
}

async function waitForControllerReady(): Promise<ServiceWorker> {
	await navigator.serviceWorker.ready;
	if (navigator.serviceWorker.controller) {
		return navigator.serviceWorker.controller;
	}

	// Wait for controller to be available
	return new Promise<ServiceWorker>((resolve) => {
		const checkController = () => {
			if (navigator.serviceWorker.controller) {
				resolve(navigator.serviceWorker.controller);
			}
		};

		navigator.serviceWorker.addEventListener('controllerchange', checkController, {
			once: true,
		});

		// Check immediately in case controller was set between ready and addEventListener
		checkController();
	});
}

function runPHPInServiceWorker(
	version: Version,
	code: string,
): Promise<string> {
	return new Promise(async (resolve, reject) => {
		try {
			// Wait for service worker controller to be ready
			const controller = await waitForControllerReady();

			if (codeState.executionId) {
				return;
			}

			// Start monitoring interval (approx 60 FPS, ~16ms)
			codeState.executionId = setInterval(() => {
				// Check if code has changed
				if (codeState.code !== code) {
					reject(new Error('Execution cancelled due to code change'));
					return;
				}
				if (codeState.version !== version) {
					reject(new Error('Execution cancelled due to version change'));
					return;
				}
				if(codeState.error) {
					reject(new Error(codeState.error));
				}
				if (codeState.result) {
					resolve(codeState.result);
				}
			}, 16);

			const request: RunPHPMessage = {
				requestId: codeState.executionId,
				version: version,
				code: code,
			}
			controller.postMessage(request);
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
	codeState.code = internalCode;
	codeState.version = version;

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
					const info = await runPHPInServiceWorker(
						version,
						internalCode,
					)
					setResult(info);
					setLoading(false);
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					setResult(`Error: ${errorMessage}`);

					setLoading(false);
				} finally {
					await clearExecution()
				}
			})();

			// Cleanup function: nothing needed, monitoring is handled in runPHPInServiceWorker
			return () => {};
		},
		[code, internalCode, loading, version, currentVersion, phpCode]
	);

	return [loading, result];
}
