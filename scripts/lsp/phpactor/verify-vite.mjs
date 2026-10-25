import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..'
);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phpactor-vite-check-'));
const entryPath = path.join(tempRoot, 'entry.ts');
const outputDir = path.join(tempRoot, 'dist');
const port = Number(process.env.PORT ?? 9303);
let previewServer;

fs.writeFileSync(
	entryPath,
	`import { createWorker } from ${JSON.stringify(path.join(repoRoot, 'src/lsp/phpactor/index.ts'))};\nexport { createWorker };\n`
);

try {
	await build({
		root: repoRoot,
		configFile: path.join(repoRoot, 'vite.config.js'),
		logLevel: 'warn',
		build: {
			outDir: outputDir,
			emptyOutDir: true,
			rollupOptions: { input: entryPath },
		},
	});

	const workerFilename = fs
		.readdirSync(outputDir)
		.find((filename) => /^phpactor-worker-.*\.js$/.test(filename));
	assert.ok(workerFilename, 'Vite did not emit the Phpactor worker chunk');
	const workerBundle = fs.readFileSync(
		path.join(outputDir, workerFilename),
		'utf8'
	);
	assert.ok(workerBundle.includes('php-8.5.wasm?'));
	assert.ok(workerBundle.includes('/lsp/phpactor/phpactor-loader.js'));
	assert.ok(workerBundle.includes('/lsp/phpactor/phpactor.data'));
	assert.ok(
		workerBundle.length <
			fs.statSync(
				path.join(repoRoot, 'assets/lsp/phpactor/phpactor-loader.js')
			).size
	);

	const expectedAssets = [
		{
			path: '/php-8.5.wasm',
			contentType: 'application/wasm',
			bytes: fs.statSync(path.join(repoRoot, 'assets/php-8.5.wasm')).size,
		},
		{
			path: '/lsp/phpactor/phpactor.data',
			contentType: '',
			bytes: fs.statSync(
				path.join(repoRoot, 'assets/lsp/phpactor/phpactor.data')
			).size,
		},
		{
			path: '/lsp/phpactor/phpactor-loader.js',
			contentType: 'text/javascript',
			bytes: fs.statSync(
				path.join(repoRoot, 'assets/lsp/phpactor/phpactor-loader.js')
			).size,
		},
	];
	for (const { path: assetPath } of expectedAssets) {
		assert.ok(
			fs.existsSync(path.join(outputDir, assetPath.slice(1))),
			`Vite did not copy public asset ${assetPath}`
		);
	}

	previewServer = await preview({
		root: repoRoot,
		configFile: path.join(repoRoot, 'vite.config.js'),
		logLevel: 'silent',
		build: { outDir: outputDir },
		preview: { host: '127.0.0.1', port, strictPort: true },
	});
	const origin = `http://127.0.0.1:${port}`;
	for (const {
		path: assetPath,
		contentType: expectedType,
		bytes: expectedBytes,
	} of expectedAssets) {
		const response = await fetch(new URL(assetPath, origin));
		const contentType = response.headers.get('content-type') ?? '';
		const body = await response.arrayBuffer();
		assert.equal(response.status, 200, `${assetPath} was not served`);
		if (expectedType) {
			assert.ok(
				contentType.toLowerCase().startsWith(expectedType),
				`${assetPath} returned unexpected Content-Type: ${contentType}`
			);
		} else {
			assert.equal(
				contentType,
				'',
				`${assetPath} unexpectedly has Content-Type ${contentType}`
			);
		}
		assert.equal(
			body.byteLength,
			expectedBytes,
			`${assetPath} response size differed from its source`
		);
		console.log(
			`${assetPath}: status=${response.status} type=${contentType || '<none>'} bytes=${body.byteLength}`
		);
	}
	console.log(
		`Vite worker bundle: ${workerFilename} bytes=${workerBundle.length}`
	);
} finally {
	await previewServer?.close();
	fs.rmSync(tempRoot, { recursive: true, force: true });
}
