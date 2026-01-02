/// <reference lib="webworker" />

import type { PHPResultMessage, RunPHPMessage } from './types';
import { startPHP, type PHP, type Version, type PHPLoaderModule } from '../php-wasm/php';

// Service Worker
// This service worker will execute PHP code via WASM

export {};

declare var self: ServiceWorkerGlobalScope;

const CACHE_NAME = 'php-wasm-v1';

const phpWasmLoaders = import.meta.glob('../wasm-assets/php-*.js', { eager: true }) as Record<string, PHPLoaderModule>;

function loadPHPLoaderModule(v: Version): PHPLoaderModule {
	const loader = phpWasmLoaders[`../wasm-assets/php-${v}.js`];
	if (!loader) {
		throw Error(`PHP ${v} assets not found.`);
	}
	return loader;
}

export async function initPHP(v: Version): Promise<PHP> {
	const PHPLoaderModule = loadPHPLoaderModule(v);
	return startPHP(v, PHPLoaderModule, 'WEBWORKER', {});
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

self.addEventListener('activate', (event: ExtendableEvent) => {
	event.waitUntil(
		(async () => {
			// Delete old caches
			const keyList = await caches.keys();
			const cachesToDelete = keyList.filter((key) => key !== CACHE_NAME);
			await Promise.all(cachesToDelete.map((key) => caches.delete(key)));

			await self.clients.claim();
		})()
	);
});

self.addEventListener('install', () => {
	void self.skipWaiting();
});

// Cache-first strategy for WASM files
self.addEventListener('fetch', (event: FetchEvent) => {
	const url = new URL(event.request.url);

	// Only cache WASM and PHP JS files
	if (url.pathname.endsWith('.wasm') || url.pathname.match(/php-\d+\.\d+.*\.js$/)) {
		event.respondWith(
			(async () => {
				// Try cache first
				const cachedResponse = await caches.match(event.request);
				if (cachedResponse) {
					return cachedResponse;
				}

				// Fetch from network and cache
				try {
					const networkResponse = await fetch(event.request);
					if (networkResponse.ok) {
						const cache = await caches.open(CACHE_NAME);
						await cache.put(event.request, networkResponse.clone());
					}
					return networkResponse;
				} catch (error) {
					throw error;
				}
			})()
		);
	}
});

// Handle messages from clients
self.addEventListener('message', (event: ExtendableMessageEvent) => {
	const phpMessage = event.data as RunPHPMessage;

	// Run PHP asynchronously
	event.waitUntil(
		(async () => {
			try {
				const php = await getOrInitPHP(phpMessage.version);
				const result = await runPHP(php, phpMessage.code);

				const resultMessage: PHPResultMessage = {
					requestId: phpMessage.requestId,
					result: result,
				};
				event.source?.postMessage(resultMessage);
			} catch (error) {
				const errorMessage: PHPResultMessage = {
					requestId: phpMessage.requestId,
					result: '',
					error:
						error instanceof Error ? error.message : String(error),
				};
				event.source?.postMessage(errorMessage);
			}
		})()
	);
});