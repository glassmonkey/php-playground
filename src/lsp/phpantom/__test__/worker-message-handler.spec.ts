import { describe, expect, it } from 'vitest';
import { createWorkerMessageHandler } from '../worker-message-handler';
import { loadPhpProfileDocuments } from '../profile-loader.mjs';

const profile = [
	{
		uri: 'phpantom-profile://php/7.4/standard/standard_1.php',
		text: '<?php function strrchr() {}',
	},
	{
		uri: 'phpantom-profile://php/7.4/Core/Core.php',
		text: '<?php function strlen() {}',
	},
];

function makeHandler(
	options: {
		failOnSecondProfile?: boolean;
		loadProfile?: (
			version: string,
			openDocument: (document: {
				uri: string;
				text: string;
			}) => Promise<void>
		) => Promise<void>;
	} = {}
) {
	const calls: Array<Record<string, unknown>> = [];
	const replies: Array<Record<string, unknown>> = [];
	let profileOpens = 0;
	const handle = createWorkerMessageHandler({
		postMessage: (message) => {
			calls.push({ boundary: 'reply', message });
			replies.push(message);
		},
		loadRuntime: async () => ({ identity: '49b9a75' }),
		loadProfile:
			options.loadProfile ??
			(async (_version, openDocument) => {
				for (const document of profile) await openDocument(document);
			}),
		versions: ['7.4', '8.0'],
		buildId: '49b9a75',
		send: (_runtime, message) => {
			calls.push({ boundary: 'upstream', message });
			if (message.method === 'initialize') {
				return {
					jsonrpc: '2.0',
					id: message.id,
					result: { serverInfo: { version: '49b9a75' } },
				};
			}
			if (
				message.method === 'textDocument/didOpen' &&
				message.params &&
				options.failOnSecondProfile
			) {
				profileOpens++;
				if (profileOpens === 2)
					throw new Error('fixture upstream didOpen failure');
			}
			if (message.method === 'textDocument/completion') {
				return {
					jsonrpc: '2.0',
					id: message.id,
					result: {
						items: [
							{
								label: 'before_needle:',
								detail: 'Named argument (optional)',
							},
							{ label: '$value', detail: 'variable' },
						],
					},
				};
			}
			return null;
		},
	});
	return { handle, calls, replies };
}

const initialize = (id: number, phpVersion: string) => ({
	jsonrpc: '2.0',
	id,
	method: 'initialize',
	params: { initializationOptions: { phpVersion } },
});

describe('PHPantom Worker message boundary', () => {
	it('connects the manifest loader output to the initialized upstream context', async () => {
		const source = new TextEncoder().encode('<?php function strrchr() {}');
		const manifest = {
			schemaVersion: 1,
			profiles: {
				'7.4': {
					files: [
						{
							logicalPath: 'standard/standard_1.php',
							url: 'standard_1.php',
							sha256: 'a'.repeat(64),
						},
					],
				},
			},
		};
		const manifestBytes = new TextEncoder().encode(
			JSON.stringify(manifest)
		);
		const { handle, calls } = makeHandler({
			loadProfile: (version, openDocument) =>
				loadPhpProfileDocuments({
					manifestUrl: 'profiles/manifest.json',
					expectedManifestSha256: 'b'.repeat(64),
					phpVersion: version,
					baseUrl: 'https://playground.example/',
					fetchResource: async (url: string) => {
						const bytes = url.endsWith('/manifest.json')
							? manifestBytes
							: source;
						return {
							ok: true,
							arrayBuffer: async () => bytes.slice().buffer,
						};
					},
					digest: async (bytes: Uint8Array) =>
						new TextDecoder().decode(bytes).startsWith('{')
							? 'b'.repeat(64)
							: 'a'.repeat(64),
					openDocument,
				}),
		});
		await handle(initialize(1, '7.4'));
		const opened = calls
			.filter(
				(entry) =>
					(entry.message as { method?: string }).method ===
					'textDocument/didOpen'
			)
			.map(
				(entry) =>
					(
						entry.message as {
							params: {
								textDocument: { uri: string; text: string };
							};
						}
					).params.textDocument
			);
		expect(opened).toEqual([
			{
				uri: 'phpantom-profile://php/7.4/standard/standard_1.php',
				languageId: 'php',
				version: 1,
				text: '<?php function strrchr() {}',
			},
		]);
		expect(calls.at(-1)?.boundary).toBe('reply');
	});

	it('rejects user requests until profile initialization is complete', async () => {
		const { handle, calls, replies } = makeHandler();
		await handle({
			jsonrpc: '2.0',
			id: 1,
			method: 'textDocument/hover',
			params: {
				textDocument: { uri: 'file:///workspace/user.php' },
				position: { line: 0, character: 0 },
			},
		});
		expect(
			calls.filter((call) => call.boundary === 'upstream')
		).toHaveLength(0);
		expect(
			(replies[0] as { error: { message: string } }).error.message
		).toMatch(/profile loading must complete first/);
	});

	it('opens every selected profile document before acknowledging initialize or forwarding user documents', async () => {
		const { handle, calls, replies } = makeHandler();
		await handle(initialize(1, '7.4'));
		expect(
			calls.map((entry) => (entry.message as { method: string }).method)
		).toEqual([
			'initialize',
			'initialized',
			'textDocument/didOpen',
			'textDocument/didOpen',
			undefined,
		]);
		expect((replies[0] as { id: number }).id).toBe(1);
		await handle({ jsonrpc: '2.0', method: 'initialized', params: {} });
		await handle({
			jsonrpc: '2.0',
			method: 'textDocument/didOpen',
			params: {
				textDocument: {
					uri: 'file:///workspace/user.php',
					version: 1,
					text: '<?php',
				},
			},
		});
		expect(
			(
				calls.at(-1)?.message as {
					params: { textDocument: { uri: string } };
				}
			).params.textDocument.uri
		).toBe('file:///workspace/user.php');
		await handle({
			jsonrpc: '2.0',
			id: 2,
			method: 'textDocument/completion',
			params: {
				textDocument: { uri: 'file:///workspace/user.php' },
				position: { line: 0, character: 0 },
			},
		});
		expect(
			(
				replies.at(-1) as {
					result: { items: Array<{ detail: string }> };
				}
			).result.items.map((item) => item.detail)
		).toEqual(['variable']);
	});

	it('protects internal URIs and requires a fresh context for a selected-version change', async () => {
		const { handle, calls, replies } = makeHandler();
		await handle(initialize(1, '7.4'));
		const sentBeforeReserved = calls.length;
		await handle({
			jsonrpc: '2.0',
			method: 'textDocument/didOpen',
			params: {
				textDocument: {
					uri: profile[0].uri,
					version: 2,
					text: '<?php function evil() {}',
				},
			},
		});
		expect(calls).toHaveLength(sentBeforeReserved);
		await handle({
			jsonrpc: '2.0',
			method: 'workspace/didChangeWatchedFiles',
			params: {
				changes: [
					{
						uri: profile[0].uri.replace(
							'phpantom-profile',
							'PHPANTOM-PROFILE'
						),
						type: 2,
					},
				],
			},
		});
		expect(calls).toHaveLength(sentBeforeReserved);
		await handle(initialize(3, '8.0'));
		expect(
			(replies.at(-1) as { error: { message: string } }).error.message
		).toMatch(/fresh Worker context/);
		const freshContext = makeHandler();
		await freshContext.handle(initialize(1, '8.0'));
		expect(
			(freshContext.replies[0] as { result: unknown }).result
		).toBeDefined();
	});

	it('closes already-opened profile documents and poisons a partially initialized context on failure', async () => {
		const { handle, calls, replies } = makeHandler({
			failOnSecondProfile: true,
		});
		await handle(initialize(1, '7.4'));
		const methods = calls
			.filter((entry) => entry.boundary === 'upstream')
			.map((entry) => (entry.message as { method: string }).method);
		expect(methods).toContain('textDocument/didClose');
		expect(methods).toContain('shutdown');
		expect(methods).toContain('exit');
		expect(
			(replies[0] as { error: { message: string } }).error.message
		).toContain('fixture upstream didOpen failure');
		const sentBeforeRetry = calls.length;
		await handle({
			jsonrpc: '2.0',
			id: 2,
			method: 'textDocument/hover',
			params: {
				textDocument: { uri: 'file:///workspace/user.php' },
				position: { line: 0, character: 0 },
			},
		});
		expect(
			calls
				.slice(sentBeforeRetry)
				.every((call) => call.boundary === 'reply')
		).toBe(true);
		expect(
			(replies.at(-1) as { error: { message: string } }).error.message
		).toContain('fixture upstream didOpen failure');
	});
});
