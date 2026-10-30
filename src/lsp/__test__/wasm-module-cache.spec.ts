import { afterEach, describe, expect, it, vi } from 'vitest';
import { compiledPhpantomModule } from '../phpantom/wasm-module-cache';

const artifactSha =
	'176d7c61743098b0e4ba6ce74751716e7154e1d9c9885b3788096a426e159bf3';
const artifact85Sha =
	'e3ce4b1977686f1f0ac8f401b46d248f63a663a54340d40e557cb6568f28560d';
const artifactSize = 18_504_747;

function digestBytes(hex: string): ArrayBuffer {
	const bytes = new Uint8Array(
		hex.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? []
	);
	return bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength
	) as ArrayBuffer;
}

describe('compiled PHPantom module cache', () => {
	afterEach(() => vi.restoreAllMocks());

	it('shares a verified immutable module by PHP version and artifact SHA', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
			ok: true,
			arrayBuffer: async () => new ArrayBuffer(artifactSize),
		} as Response);
		const digest = vi
			.spyOn(crypto.subtle, 'digest')
			.mockImplementation(async () => {
				const url = String(fetchMock.mock.calls.at(-1)?.[0]);
				return digestBytes(
					url.includes('/8.5/') ? artifact85Sha : artifactSha
				);
			});
		const compiled = vi
			.spyOn(WebAssembly, 'compile')
			.mockResolvedValue({} as WebAssembly.Module);

		const first = compiledPhpantomModule('7.4');
		const second = compiledPhpantomModule('7.4');

		expect(second).toBe(first);
		await expect(first).resolves.toBeInstanceOf(Object);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith(
			`/lsp/phpantom/versioned-preview/7.4/phpantom_lsp.wasm?sha256=${artifactSha}`,
			{ cache: 'force-cache' }
		);
		expect(digest).toHaveBeenCalledTimes(1);
		expect(compiled).toHaveBeenCalledTimes(1);

		const version85 = compiledPhpantomModule('8.5');
		expect(version85).not.toBe(first);
		await expect(version85).resolves.toBeInstanceOf(Object);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock).toHaveBeenLastCalledWith(
			`/lsp/phpantom/versioned-preview/8.5/phpantom_lsp.wasm?sha256=${artifact85Sha}`,
			{ cache: 'force-cache' }
		);
		expect(digest).toHaveBeenCalledTimes(2);
		expect(compiled).toHaveBeenCalledTimes(2);
	});

	it('rejects an unreviewed version before fetching a WASM file', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch');
		await expect(compiledPhpantomModule('8.4')).rejects.toThrow(
			/PHPantom versioned preview is verified only for PHP 7\.4, 8\.0, 8\.3, 8\.5/
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
