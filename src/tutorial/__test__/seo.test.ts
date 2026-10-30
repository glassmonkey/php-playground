import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderMetadataHtml, tutorialSeoBuildPlugin } from '../seo-build';
import { lessonsByVersion } from '../content';
import { latestTutorialVersion, tutorialVersions } from '../config';
import { getHomeMetadata } from '../seo';

const template = readFileSync('index.html', 'utf8');

describe('static metadata HTML', () => {
	it('leaves the authoring HTML entry unchanged', () => {
		const html = readFileSync(
			'src/tutorial/authoring/assessment-harness.html',
			'utf8'
		);
		const plugin = tutorialSeoBuildPlugin() as unknown as {
			transformIndexHtml: {
				handler(
					html: string,
					context: { filename: string; path: string; server: object }
				): string;
			};
		};
		expect(
			plugin.transformIndexHtml.handler(html, {
				filename: 'src/tutorial/authoring/assessment-harness.html',
				path: '/src/tutorial/authoring/assessment-harness.html',
				server: {},
			})
		).toBe(html);
	});

	it('writes escaped metadata before JavaScript runs and preserves the app entry', () => {
		const html = renderMetadataHtml(template, {
			title: 'Strings & "quotes" <PHP> $&',
			description: 'Read "a & b" safely.',
			canonicalPath: '/tutorial/5.6/string-functions/',
			canonicalUrl: 'https://php-play.dev/tutorial/5.6/string-functions/',
			imageUrl:
				'https://php-play.dev/tutorial/5.6/string-functions/og.png',
			imageAlt: 'String functions & PHP',
		});
		expect(html.match(/<link\s+rel="canonical"[^>]*>/g)).toEqual([
			'<link rel="canonical" href="https://php-play.dev/tutorial/5.6/string-functions/">',
		]);
		expect(html).toContain(
			'<title>Strings &amp; &quot;quotes&quot; &lt;PHP&gt; $&amp;</title>'
		);
		expect(html).toContain(
			'<meta name="description" content="Read &quot;a &amp; b&quot; safely.">'
		);
		expect(html).toContain(
			'<meta property="og:url" content="https://php-play.dev/tutorial/5.6/string-functions/">'
		);
		expect(html).toContain('href="/favicon.svg"');
		expect(html).toContain('src="/src/index.tsx"');
	});
	it('rejects a duplicate canonical instead of emitting conflicting hints', () => {
		const duplicate = template.replace(
			'</head>',
			'<link rel="canonical" href="https://example.com/">\n</head>'
		);
		expect(() => renderMetadataHtml(duplicate, getHomeMetadata())).toThrow(
			'Expected exactly one canonical link'
		);
	});
});

describe('tutorial SEO build emission', () => {
	it('emits registry pages with one canonical and excludes aliases and unsupported lessons from the sitemap', () => {
		type Asset = {
			type: 'asset';
			fileName: string;
			source: string | Uint8Array;
		};
		// Exercise the actual Vite hooks with only the context API this plugin uses.
		const plugin = tutorialSeoBuildPlugin() as unknown as {
			transformIndexHtml: { handler(html: string): string };
			generateBundle(this: { emitFile(asset: Asset): void }): void;
		};
		const assets: Asset[] = [];
		const home = plugin.transformIndexHtml.handler(template);
		plugin.generateBundle.call({
			emitFile: (asset) => {
				assets.push(asset);
			},
		});
		const emitted = new Map(
			assets.map((asset) => [asset.fileName, asset.source])
		);
		expect(emitted.size).toBe(assets.length);
		const fixedPaths = tutorialVersions.flatMap((version) => [
			`/tutorial/${version}/`,
			...lessonsByVersion[version].map(
				(lesson) => `/tutorial/${version}/${lesson.slug}/`
			),
		]);
		const expectedUrls = [
			'https://php-play.dev/',
			...fixedPaths.map((path) => `https://php-play.dev${path}`),
		];
		const sitemapUrls = Array.from(
			(emitted.get('sitemap.xml') as string).matchAll(
				/<loc>([^<]+)<\/loc>/g
			),
			(match) => match[1]
		);
		expect(sitemapUrls.sort()).toEqual(expectedUrls.sort());
		expect(new Set(sitemapUrls).size).toBe(sitemapUrls.length);
		expect(home.match(/<link\s+rel="canonical"[^>]*>/g)).toEqual([
			'<link rel="canonical" href="https://php-play.dev/">',
		]);
		for (const path of fixedPaths) {
			const html = emitted.get(`${path.slice(1)}index.html`) as string;
			const png = emitted.get(`${path.slice(1)}og.png`);
			expect(png).toBeInstanceOf(Uint8Array);
			expect(Array.from((png as Uint8Array).slice(0, 8))).toEqual([
				137, 80, 78, 71, 13, 10, 26, 10,
			]);
			expect(html).toContain(
				`<meta property="og:image" content="https://php-play.dev${path}og.png">`
			);
			expect(html.match(/<link\s+rel="canonical"[^>]*>/g), path).toEqual([
				`<link rel="canonical" href="https://php-play.dev${path}">`,
			]);
			expect(html, path).toContain(
				`<meta property="og:url" content="https://php-play.dev${path}">`
			);
			expect(html, path).toContain('src="/src/index.tsx"');
		}
		expect(emitted.has('tutorial/8.0/enums/index.html')).toBe(false);
		expect(emitted.has('tutorial/8.3/property-hooks/index.html')).toBe(
			false
		);
		expect(emitted.has('tutorial/5.5/index.html')).toBe(false);
		const aliases = [
			['tutorial/index.html', `/tutorial/${latestTutorialVersion}/`],
			[
				'tutorial/latest/index.html',
				`/tutorial/${latestTutorialVersion}/`,
			],
			...lessonsByVersion[latestTutorialVersion].map((lesson) => [
				`tutorial/latest/${lesson.slug}/index.html`,
				`/tutorial/${latestTutorialVersion}/${lesson.slug}/`,
			]),
		];
		for (const [file, path] of aliases) {
			const html = emitted.get(file) as string;
			expect(html, file).toContain(
				`<meta http-equiv="refresh" content="0;url=https://php-play.dev${path}">`
			);
			expect(html, file).toContain(
				`window.location.replace("https://php-play.dev${path}")`
			);
			expect(html.match(/<link\s+rel="canonical"[^>]*>/g), file).toEqual([
				`<link rel="canonical" href="https://php-play.dev${path}">`,
			]);
		}
		expect(emitted.get('robots.txt')).toContain(
			'Sitemap: https://php-play.dev/sitemap.xml'
		);
	}, 30_000);
});
