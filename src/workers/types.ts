import type { Version } from '../php-wasm/php';

// Message from Service Worker to Client
export interface PHPResultMessage {
	requestId: NodeJS.Timeout;
	result: string;
	error?: string;
}

// Message from Client to Service Worker
export interface RunPHPMessage {
	requestId: NodeJS.Timeout;
	version: Version;
	code: string;
}
