// Client-side Service Worker integration
import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import type { Version } from '../php-wasm/php';
import type { PHPResultMessage, RunPHPMessage } from './types';

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

type PHPResultCallback = (result: string, error?: string) => void;

const pendingRequests = new Map<string, PHPResultCallback>();

export async function registerServiceWorker(): Promise<void> {
	if (!('serviceWorker' in navigator)) {
		console.warn('Service Worker is not supported in this browser');
		return;
	}

	console.log('Registering Service Worker...');

	registerSW({
		onRegisteredSW(_swScriptUrl, registration) {
			console.log('Service Worker registered with scope:', registration?.scope);
		},
		onRegisterError(error) {
			console.error('Service Worker registration failed:', error);
		}
	});

	navigator.serviceWorker.addEventListener('message', (event: MessageEvent<PHPResultMessage>) => {
		const phpResult = event.data;
		const callback = pendingRequests.get(phpResult.requestId);
		if (callback) {
			callback(phpResult.result, phpResult.error);
			pendingRequests.delete(phpResult.requestId);
		}
	});
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
	code: string
): Promise<string> {
	return new Promise(async (resolve, reject) => {
		try {
			// Wait for service worker controller to be ready
			const controller = await waitForControllerReady();

			const requestId = `php-${Date.now()}-${Math.random()}`;

			pendingRequests.set(requestId, (result, error) => {
				if (error) {
					reject(new Error(error));
				} else {
					resolve(result);
				}
			});

			const message: RunPHPMessage = {
				requestId,
				version,
				code,
			};
			controller.postMessage(message);
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

			setTimeout(async function () {
				try {
					const info = await runPHPInServiceWorker(version, internalCode);
					setResult(info);
					setLoading(false);
				} catch (error) {
					setResult(
						`Error: ${error instanceof Error ? error.message : String(error)}`
					);
					setLoading(false);
				}
			}, 15);
		},
		[code, internalCode, loading, version, currentVersion, phpCode]
	);

	return [loading, result];
}
