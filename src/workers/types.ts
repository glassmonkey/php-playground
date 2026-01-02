import type { Version } from '../php-wasm/php';

// Message from Service Worker to Client
export interface PHPResultMessage {
	requestId: string;
	result: string;
	error?: string;
}

// Message from Client to Service Worker
export interface RunPHPMessage {
	requestId: string;
	version: Version;
	code: string;
}
