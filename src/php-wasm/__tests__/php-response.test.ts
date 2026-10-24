import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as phpLoaderModule from '../../wasm-assets/php-8.5.js';
import { PHPServer, startPHP } from '../index';

const phpWasm = readFileSync(
	new URL('../../../assets/php-8.5.wasm', import.meta.url)
);

async function createPHP() {
	return startPHP('8.5', phpLoaderModule, 'NODE', { wasmBinary: phpWasm });
}

describe('PHP response body bytes', () => {
	it('returns PHP stdout as bytes that decode to the original output', async () => {
		const php = await createPHP();
		const output = 'stdout 🌍';

		const response = php.run({ code: `echo '${output}';` });
		const body: Uint8Array = response.body;

		expect(response.body).toBeInstanceOf(Uint8Array);
		expect(response.errors).toBe('');
		expect(Array.from(body)).toEqual(
			Array.from(new TextEncoder().encode(output))
		);
		expect(new TextDecoder().decode(body)).toBe(output);
	});

	it('returns a PHPServer response body as bytes for a PHP request', async () => {
		const php = await createPHP();
		php.mkdirTree('/www');
		php.writeFile('/www/index.php', '<?php echo "server stdout";');
		const server = new PHPServer(php, {
			documentRoot: '/www',
			absoluteUrl: 'http://example.test',
		});

		const response = await server.request({
			absoluteUrl: 'http://example.test/index.php',
		});
		const body: Uint8Array = response.body;

		expect(response.httpStatusCode).toBe(200);
		expect(response.body).toBeInstanceOf(Uint8Array);
		expect(response.errors).toBe('');
		expect(new TextDecoder().decode(body)).toBe('server stdout');
	});

	it('returns static-file bytes through PHPServer.request', async () => {
		const php = await createPHP();
		php.mkdirTree('/www');
		const contents = new TextEncoder().encode('static bytes 🌍');
		php.writeFile('/www/asset.bin', contents);
		const server = new PHPServer(php, {
			documentRoot: '/www',
			absoluteUrl: 'http://example.test',
			isStaticFilePath: (path) => path.endsWith('.bin'),
		});

		const response = await server.request({
			absoluteUrl: 'http://example.test/asset.bin',
		});
		const body: Uint8Array = response.body;

		expect(response.httpStatusCode).toBe(200);
		expect(response.body).toBeInstanceOf(Uint8Array);
		expect(Array.from(body)).toEqual(Array.from(contents));
		expect(new TextDecoder().decode(body)).toBe('static bytes 🌍');
	});

	it('returns a decodable 404 body through PHPServer.request', async () => {
		const php = await createPHP();
		const server = new PHPServer(php, {
			documentRoot: '/www',
			absoluteUrl: 'http://example.test',
			isStaticFilePath: (path) => path.endsWith('.bin'),
		});

		const response = await server.request({
			absoluteUrl: 'http://example.test/missing.bin',
		});
		const body: Uint8Array = response.body;

		expect(response.httpStatusCode).toBe(404);
		expect(response.body).toBeInstanceOf(Uint8Array);
		expect(new TextDecoder().decode(body)).toBe('404 File not found');
	});
});
