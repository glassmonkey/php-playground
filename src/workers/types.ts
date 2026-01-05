import type { Version } from '../php-wasm/php';

// Message from Web Worker to Main Thread
export interface PHPResultMessage {
	requestId: string;
	result: string;
	error?: string;
}

// Message from Main Thread to Web Worker
export interface RunPHPMessage {
	requestId: string;
	version: Version;
	code: string;
}
