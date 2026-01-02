/// <reference lib="webworker" />

import { MessageType, type ShowAlertMessage } from './types';

// Service Worker
// This service worker will send a message to all clients 1 second after activation

export {};

declare var self: ServiceWorkerGlobalScope;

self.addEventListener('activate', (event: ExtendableEvent) => {
	event.waitUntil(
		self.clients.claim().then(() => {
			// Wait for 1 second, then send message to all clients
			return new Promise<void>((resolve) => {
				setTimeout(async () => {
					const clients = await self.clients.matchAll({ type: 'window' });
					const message: ShowAlertMessage = {
						type: MessageType.SHOW_ALERT,
						message: 'hello world',
					};
					clients.forEach((client: Client) => {
						client.postMessage(message);
					});
					resolve();
				}, 1000);
			});
		})
	);
});

// Optional: Also handle the install event
self.addEventListener('install', () => {
	void self.skipWaiting();
});