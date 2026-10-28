import { readFileSync } from 'node:fs';
import { argv } from 'node:process';
import { WASI } from 'node:wasi';

const wasmPath =
	argv[2] ?? 'target/wasm32-wasip1/wasm-release/phpantom_runtime_wrapper.wasm';
const module = await WebAssembly.compile(readFileSync(wasmPath));
const versions = [
	'5.6',
	'7.0',
	'7.1',
	'7.2',
	'7.3',
	'7.4',
	'8.0',
	'8.1',
	'8.2',
	'8.3',
	'8.4',
	'8.5',
];

for (const [index, version] of versions.entries()) {
	const wasi = new WASI({ version: 'preview1', args: [], env: {} });
	const instance = await WebAssembly.instantiate(module, wasi.getImportObject());
	wasi.initialize(instance);

	const { memory, lsp_alloc, lsp_dealloc, lsp_handle, lsp_response_len } =
		instance.exports;
	const payload = new TextEncoder().encode(
		JSON.stringify({
			jsonrpc: '2.0',
			id: index + 1,
			method: 'initialize',
			params: {
				capabilities: {},
				initializationOptions: { phpVersion: version },
			},
		}),
	);
	const input = lsp_alloc(payload.length);
	new Uint8Array(memory.buffer, input, payload.length).set(payload);
	const output = lsp_handle(input, payload.length);
	lsp_dealloc(input, payload.length);
	if (output === 0) throw new Error(`PHP ${version}: initialize returned no reply`);

	const responseLength = lsp_response_len();
	const responseBytes = new Uint8Array(memory.buffer, output, responseLength).slice();
	lsp_dealloc(output, responseLength);
	const response = JSON.parse(new TextDecoder().decode(responseBytes));
	const expectedVersion = `0.11.1+php-version-setting.3:php${version}`;
	if (
		response.id !== index + 1 ||
		response.error != null ||
		response.result?.serverInfo?.version !== expectedVersion
	) {
		throw new Error(`PHP ${version}: unexpected initialize response ${JSON.stringify(response)}`);
	}
	console.log(`PHP ${version}: initialize ok`);
}

console.log(`WASI PHP version initialization: ${versions.length}/${versions.length} passed`);
