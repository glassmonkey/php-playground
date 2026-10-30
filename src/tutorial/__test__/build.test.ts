import { it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { latestTutorialVersion } from '../config';

it('builds deployable tutorial HTML and images with the normal Vite configuration', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'php-tutorial-build-'));
	try {
		// Exercise the public build entry point; a serve-only/missing plugin must fail here.
		await promisify(execFile)(
			process.execPath,
			[
				'node_modules/vite/bin/vite.js',
				'build',
				'--outDir',
				directory,
				'--emptyOutDir',
			],
			{ maxBuffer: 4 * 1024 * 1024 }
		);
		for (const path of ['/tutorial/5.6/', '/tutorial/8.5/variables/']) {
			const html = await readFile(
				join(directory, path, 'index.html'),
				'utf8'
			);
			expect(
				Array.from(
					html.matchAll(/<link\s+rel="canonical" href="([^"]+)"/g),
					(match) => match[1]
				)
			).toEqual([`https://php-play.dev${path}`]);
			expect(html).toContain(
				`content="https://php-play.dev${path}og.png"`
			);
			expect(html).not.toContain('/src/index.tsx');
			const references = Array.from(
				html.matchAll(
					/(?:src|href)="(\/[^"?#]+\.(?:js|css))(?:[?#][^"]*)?"/g
				),
				(match) => match[1]
			);
			expect(references.some((file) => file.endsWith('.js'))).toBe(true);
			expect(references.some((file) => file.endsWith('.css'))).toBe(true);
			for (const file of references)
				expect(
					(await readFile(join(directory, file))).byteLength
				).toBeGreaterThan(0);
			const image = await readFile(join(directory, path, 'og.png'));
			expect({
				signature: Array.from(image.subarray(0, 8)),
				width: image.readUInt32BE(16),
				height: image.readUInt32BE(20),
			}).toEqual({
				signature: [137, 80, 78, 71, 13, 10, 26, 10],
				width: 1200,
				height: 630,
			});
		}
		for (const alias of ['/tutorial/', '/tutorial/latest/']) {
			const html = await readFile(
				join(directory, alias, 'index.html'),
				'utf8'
			);
			expect(html).toContain(
				`<link rel="canonical" href="https://php-play.dev/tutorial/${latestTutorialVersion}/">`
			);
			expect(html).toContain(
				`window.location.replace("https://php-play.dev/tutorial/${latestTutorialVersion}/")`
			);
		}
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}, 60_000);
