/// <reference lib="webworker" />

import {
	ClientMessageType,
	WorkerMessageType,
	type ShowAlertMessage,
	type WorkerMessage,
} from './types';

// Service Worker
// This service worker will send a message to clients when requested

export {};

declare var self: ServiceWorkerGlobalScope;

self.addEventListener('activate', (event: ExtendableEvent) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener('install', () => {
	void self.skipWaiting();
});

// Handle messages from clients
self.addEventListener('message', (event: ExtendableMessageEvent) => {
	const data = event.data as WorkerMessage;

	if (data.type === WorkerMessageType.TRIGGER_ALERT) {
		// Send alert message back to the client who sent the request
		const message: ShowAlertMessage = {
			type: ClientMessageType.SHOW_ALERT,
			message: 'hello world',
		};
		event.source?.postMessage(message);
	}
});