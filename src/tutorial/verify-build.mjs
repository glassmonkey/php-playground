import process from 'node:process';
import { build } from 'esbuild';
import { Buffer } from 'node:buffer';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { SITE_ORIGIN } from './seo.ts';

// Resolve the actual configuration without changing its source import conventions.
const configuration = await build({
	entryPoints: ['src/tutorial/config.ts'],
	bundle: true,
	platform: 'node',
	format: 'esm',
	write: false,
});
const { tutorialVersions, latestTutorialVersion } = await import(
	`data:text/javascript;base64,${Buffer.from(configuration.outputFiles[0].text).toString('base64')}`
);
const directory = resolve(process.argv[2] ?? 'public');
const text = (path) => readFile(join(directory, path), 'utf8');
async function requireAsset(path) {
	const asset = await stat(join(directory, path));
	if (!asset.isFile() || asset.size === 0)
		throw new Error(`Missing or empty built asset: ${path}`);
}
function canonical(html) {
	const values = Array.from(
		html.matchAll(/<link\s+rel="canonical" href="([^"]+)"/g),
		(match) => match[1]
	);
	if (values.length !== 1)
		throw new Error('Expected exactly one built canonical URL.');
	return new URL(values[0]);
}
const sitemap = await text('sitemap.xml');
const urls = Array.from(
	sitemap.matchAll(/<loc>([^<]+)<\/loc>/g),
	(match) => match[1]
);
if (
	!urls.includes(`${SITE_ORIGIN}/`) ||
	!urls.some((url) => url.includes('/tutorial/'))
)
	throw new Error(
		'The sitemap must include the home page and tutorial routes.'
	);
if (new Set(urls).size !== urls.length)
	throw new Error('Duplicate sitemap URLs.');
for (const version of tutorialVersions) {
	const index = `${SITE_ORIGIN}/tutorial/${version}/`;
	if (
		!urls.includes(index) ||
		!urls.some((url) => url.startsWith(index) && url !== index)
	)
		throw new Error(`Missing built curriculum: ${version}`);
}
let images = 0;
for (const address of urls) {
	const url = new URL(address);
	if (
		url.origin !== SITE_ORIGIN ||
		url.search ||
		url.hash ||
		url.pathname.includes('/latest/') ||
		url.pathname === '/tutorial/'
	)
		throw new Error(`Invalid sitemap URL: ${address}`);
	const html = await text(join(url.pathname, 'index.html'));
	if (canonical(html).href !== address)
		throw new Error(`Canonical mismatch: ${address}`);
	if (html.includes('/src/index.tsx'))
		throw new Error(`Uncompiled entry point: ${address}`);
	const assets = Array.from(
		html.matchAll(/(?:src|href)="(\/[^"?#]+\.(?:js|css))(?:[?#][^"]*)?"/g),
		(match) => match[1]
	);
	if (
		!assets.some((path) => path.endsWith('.js')) ||
		!assets.some((path) => path.endsWith('.css'))
	)
		throw new Error(`Missing compiled JS/CSS references: ${address}`);
	for (const path of assets) await requireAsset(path);
	if (url.pathname.startsWith('/tutorial/')) {
		const imageUrl = new URL(`${url.pathname}og.png`, SITE_ORIGIN).href;
		for (const tag of [`property="og:image"`, `name="twitter:image"`]) {
			if (!html.includes(`<meta ${tag} content="${imageUrl}">`))
				throw new Error(`Image metadata mismatch: ${address}`);
		}
		await requireAsset(`${url.pathname}og.png`);
		images++;
	}
}
const latestIndex = `${SITE_ORIGIN}/tutorial/${latestTutorialVersion}/`;
const aliases = [
	['/tutorial/', latestIndex],
	['/tutorial/latest/', latestIndex],
	...urls
		.filter((url) => url.startsWith(latestIndex) && url !== latestIndex)
		.map((url) => [
			new URL(url).pathname.replace(
				`/tutorial/${latestTutorialVersion}/`,
				'/tutorial/latest/'
			),
			url,
		]),
];
for (const [path, expected] of aliases) {
	const html = await text(join(path, 'index.html'));
	const target = canonical(html);
	if (target.href !== expected)
		throw new Error(`Alias target must use configured latest: ${path}`);
	await requireAsset(join(target.pathname, 'index.html'));
	if (
		!html.includes(`window.location.replace("${expected}")`) ||
		!html.includes(`content="0;url=${expected}"`)
	)
		throw new Error(`Alias redirect mismatch: ${path}`);
}
console.log(
	`Verified ${urls.length} canonical pages, ${images} image references, compiled assets and ${aliases.length} configured-latest aliases. PNG decoding is covered by browser tests.`
);
