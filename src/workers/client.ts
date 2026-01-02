import { ClientMessageType, WorkerMessageType, type ClientMessage } from './types';
import { registerSW } from 'virtual:pwa-register';

export function registerServiceWorker(): void {
	if (!('serviceWorker' in navigator)) {
		console.warn('Service Worker is not supported in this browser');
		return;
	}

	console.log('Registering Service Worker...');

	// Register service worker using Vite PWA
	registerSW({
		onRegisteredSW(swScriptUrl, registration) {
			console.log('Service Worker registered with scope:', registration?.scope);
		},
		onRegisterError(error) {
			console.error('Service Worker registration failed:', error);
		}
	});

	// Listen for messages from service worker
	navigator.serviceWorker.addEventListener('message', (event: MessageEvent<ClientMessage>) => {
		const { type, message } = event.data;

		switch (type) {
			case ClientMessageType.SHOW_ALERT:
				alert(message);
				break;
			default:
				console.warn('Unknown message type from service worker:', type);
		}
	});
}

export function triggerServiceWorkerAlert(): void {
	if (!navigator.serviceWorker.controller) {
		console.warn('Service Worker is not active');
		return;
	}

	// Send message to service worker
	navigator.serviceWorker.controller.postMessage({
		type: WorkerMessageType.TRIGGER_ALERT,
	});
}
