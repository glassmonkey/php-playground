import type { Version } from '../php-wasm/php';

// Message from Web Worker to Main Thread
export interface PHPResultMessage {
	requestId: NodeJS.Timeout
	result: string;
	error?: string;
}

// Message from Main Thread to Web Worker
export interface RunPHPMessage {
	requestId: NodeJS.Timeout
	version: Version;
	code: string;
}
