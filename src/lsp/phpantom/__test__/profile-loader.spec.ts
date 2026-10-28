import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
	loadPhpProfileDocuments,
	validatePhpProfileManifest,
} from '../profile-loader.mjs';

const baseUrl = 'https://playground.example/app/';
const sha256 = (value: Uint8Array) =>
	createHash('sha256').update(value).digest('hex');

describe('PHP profile loader', () => {
	it('validates and loads the fully resolved selected file set in manifest order', async () => {
		const first = new TextEncoder().encode('<?php function strrchr() {}');
		const second = new TextEncoder().encode(
			'<?php function str_contains() {}'
		);
		const manifest = {
			schemaVersion: 1,
			profiles: {
				'8.0': {
					files: [
						{
							logicalPath: 'standard/standard_1.php',
							url: 'shared-1.php',
							sha256: sha256(first),
						},
						{
							logicalPath: 'Core/Core.php',
							url: 'php-8.0-Core.php',
							sha256: sha256(second),
						},
						{
							logicalPath: 'shared/standard_1.php',
							url: 'shared-1.php',
							sha256: sha256(first),
						},
					],
				},
			},
		};
		const manifestBytes = new TextEncoder().encode(
			JSON.stringify(manifest)
		);
		const resources = new Map([
			[new URL('profiles/manifest.json', baseUrl).href, manifestBytes],
			[
				new URL('shared-1.php', `${baseUrl}profiles/manifest.json`)
					.href,
				first,
			],
			[
				new URL('php-8.0-Core.php', `${baseUrl}profiles/manifest.json`)
					.href,
				second,
			],
		]);
		const fetchResource = vi.fn(async (url: string) => {
			const bytes = resources.get(url);
			return bytes
				? { ok: true, arrayBuffer: async () => bytes.slice().buffer }
				: {
						ok: false,
						status: 404,
						arrayBuffer: async () => new ArrayBuffer(0),
					};
		});

		const documents: Array<{ uri: string; text: string }> = [];
		await loadPhpProfileDocuments({
			manifestUrl: 'profiles/manifest.json',
			expectedManifestSha256: sha256(manifestBytes),
			phpVersion: '8.0',
			baseUrl,
			fetchResource,
			digest: async (bytes: Uint8Array) => sha256(bytes),
			openDocument: async (document: { uri: string; text: string }) => {
				documents.push(document);
			},
		});

		expect(documents).toEqual([
			{
				uri: 'phpantom-profile://php/8.0/standard/standard_1.php',
				text: '<?php function strrchr() {}',
			},
			{
				uri: 'phpantom-profile://php/8.0/Core/Core.php',
				text: '<?php function str_contains() {}',
			},
			{
				uri: 'phpantom-profile://php/8.0/shared/standard_1.php',
				text: '<?php function strrchr() {}',
			},
		]);
		expect(fetchResource.mock.calls.map(([url]) => url)).toEqual([
			...resources.keys(),
		]);
	});

	it('rejects an unpinned manifest and mismatched source bytes', async () => {
		const bytes = new TextEncoder().encode(
			'{"schemaVersion":1,"profiles":{}}'
		);
		const fetchResource = vi.fn(async () => ({
			ok: true,
			arrayBuffer: async () => bytes.slice().buffer,
		}));
		await expect(
			loadPhpProfileDocuments({
				manifestUrl: 'profiles/manifest.json',
				expectedManifestSha256: '0'.repeat(64),
				phpVersion: '8.0',
				baseUrl,
				fetchResource,
				digest: async (value: Uint8Array) => sha256(value),
				openDocument: async () => {},
			})
		).rejects.toThrow(/manifest SHA-256/);

		const profile = {
			schemaVersion: 1,
			profiles: {
				'8.0': {
					files: [
						{
							logicalPath: 'Core.php',
							url: 'Core.php',
							sha256: 'a'.repeat(64),
						},
					],
				},
			},
		};
		const profileBytes = new TextEncoder().encode(JSON.stringify(profile));
		const resources = new Map([
			[new URL('profiles/manifest.json', baseUrl).href, profileBytes],
			[
				new URL('Core.php', `${baseUrl}profiles/manifest.json`).href,
				new TextEncoder().encode('wrong bytes'),
			],
		]);
		await expect(
			loadPhpProfileDocuments({
				manifestUrl: 'profiles/manifest.json',
				expectedManifestSha256: sha256(profileBytes),
				phpVersion: '8.0',
				baseUrl,
				fetchResource: async (url: string) => {
					const value = resources.get(url);
					return value
						? {
								ok: true,
								arrayBuffer: async () => value.slice().buffer,
							}
						: {
								ok: false,
								status: 404,
								arrayBuffer: async () => new ArrayBuffer(0),
							};
				},
				digest: async (value: Uint8Array) => sha256(value),
				openDocument: async () => {},
			})
		).rejects.toThrow(/input SHA-256 mismatch/);
	});

	it.each([
		[
			'duplicate logical paths',
			[
				{
					logicalPath: 'Core.php',
					url: 'one.php',
					sha256: 'a'.repeat(64),
				},
				{
					logicalPath: 'Core.php',
					url: 'two.php',
					sha256: 'b'.repeat(64),
				},
			],
		],
		[
			'absolute URL',
			[
				{
					logicalPath: 'Core.php',
					url: 'https://evil.example/Core.php',
					sha256: 'a'.repeat(64),
				},
			],
		],
		[
			'parent URL traversal',
			[
				{
					logicalPath: 'Core.php',
					url: '%2e%2e/Core.php',
					sha256: 'a'.repeat(64),
				},
			],
		],
		[
			'parent logical path',
			[
				{
					logicalPath: '../Core.php',
					url: 'Core.php',
					sha256: 'a'.repeat(64),
				},
			],
		],
	])('rejects %s', (_name, files) => {
		expect(() =>
			validatePhpProfileManifest(
				{
					schemaVersion: 1,
					profiles: { '8.0': { files } },
				},
				'8.0',
				baseUrl
			)
		).toThrow();
	});
});
