import { MessageType, type WorkerMessage } from './types';
import { registerSW } from 'virtual:pwa-register';

export function registerServiceWorker(): void {
	if (!('serviceWorker' in navigator)) {
		console.warn('Service Worker is not supported in this browser');
		return;
	}

	console.log('Registering Service Worker...');

	// Register service worker using Vite PWA
	registerSW({
		onRegistered(registration) {
			console.log('Service Worker registered with scope:', registration?.scope);
		},
		onRegisterError(error) {
			console.error('Service Worker registration failed:', error);
		}
	});

	// Listen for messages from service worker
	navigator.serviceWorker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
		const { type, message } = event.data;

		switch (type) {
			case MessageType.SHOW_ALERT:
				alert(message);
				break;
			default:
				console.warn('Unknown message type from service worker:', type);
		}
	});
}
