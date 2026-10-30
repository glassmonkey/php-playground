import { lessonsByVersion } from './content';
import { latestTutorialVersion, tutorialVersions } from './config';
import { getHomeMetadata, getTutorialMetadata, SITE_ORIGIN } from './seo';
import type { Plugin } from 'vite';

function escapeAttribute(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function replaceExactlyOne(
	html: string,
	pattern: RegExp,
	replacement: string,
	label: string
): string {
	const matches = html.match(pattern);
	if (!matches || matches.length !== 1) {
		throw new Error(`Expected exactly one ${label} in built index.html.`);
	}
	return html.replace(pattern, () => replacement);
}

export function renderMetadataHtml(
	template: string,
	metadata: ReturnType<typeof getHomeMetadata>
): string {
	let html = template;
	html = replaceExactlyOne(
		html,
		/<title>[^<]*<\/title>/gi,
		`<title>${escapeAttribute(metadata.title)}</title>`,
		'title'
	);
	html = replaceExactlyOne(
		html,
		/<link\s+rel=["']canonical["'][^>]*>/gi,
		`<link rel="canonical" href="${escapeAttribute(metadata.canonicalUrl)}">`,
		'canonical link'
	);
	html = replaceExactlyOne(
		html,
		/<meta\s+name=["']description["'][^>]*>/gi,
		`<meta name="description" content="${escapeAttribute(metadata.description)}">`,
		'description meta'
	);
	html = replaceExactlyOne(
		html,
		/<meta\s+property=["']og:url["'][^>]*>/gi,
		`<meta property="og:url" content="${escapeAttribute(metadata.canonicalUrl)}">`,
		'Open Graph URL'
	);
	html = replaceExactlyOne(
		html,
		/<meta\s+property=["']og:title["'][^>]*>/gi,
		`<meta property="og:title" content="${escapeAttribute(metadata.title)}">`,
		'Open Graph title'
	);
	html = replaceExactlyOne(
		html,
		/<meta\s+property=["']og:description["'][^>]*>/gi,
		`<meta property="og:description" content="${escapeAttribute(metadata.description)}">`,
		'Open Graph description'
	);
	return html.replace(/href=(['"])favicon\.svg\1/g, 'href="/favicon.svg"');
}

function redirectHtml(targetUrl: string, title: string): string {
	const escapedUrl = escapeAttribute(targetUrl);
	const escapedTitle = escapeAttribute(title);
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapedTitle}</title>
<link rel="canonical" href="${escapedUrl}">
<meta http-equiv="refresh" content="0;url=${escapedUrl}">
</head>
<body>
<p>This tutorial address has moved. <a href="${escapedUrl}">Continue to ${escapedTitle}</a>.</p>
<script>window.location.replace(${JSON.stringify(targetUrl)});</script>
</body>
</html>`;
}

function outputPath(path: string): string {
	return `${path.replace(/^\/+|\/+$/g, '')}/index.html`;
}

function sitemapXml(urls: readonly string[]): string {
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
		.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`)
		.join('\n')}\n</urlset>\n`;
}

function allCanonicalUrls(): string[] {
	const urls = new Set<string>([new URL('/', SITE_ORIGIN).toString()]);
	for (const version of tutorialVersions) {
		urls.add(getTutorialMetadata(version).canonicalUrl);
		for (const lesson of lessonsByVersion[version]) {
			urls.add(getTutorialMetadata(version, lesson).canonicalUrl);
		}
	}
	return [...urls];
}

function discoveryAssets() {
	return [
		{
			fileName: 'sitemap.xml',
			contentType: 'application/xml; charset=utf-8',
			source: sitemapXml(allCanonicalUrls()),
		},
		{
			fileName: 'robots.txt',
			contentType: 'text/plain; charset=utf-8',
			source: `User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap.xml', SITE_ORIGIN).toString()}\n`,
		},
	];
}

function emitStaticTutorialPages(
	emitFile: (asset: {
		type: 'asset';
		fileName: string;
		source: string;
	}) => void,
	template: string
): void {
	for (const version of tutorialVersions) {
		const indexMetadata = getTutorialMetadata(version);
		emitFile({
			type: 'asset',
			fileName: outputPath(indexMetadata.canonicalPath),
			source: renderMetadataHtml(template, indexMetadata),
		});
		for (const lesson of lessonsByVersion[version]) {
			const metadata = getTutorialMetadata(version, lesson);
			emitFile({
				type: 'asset',
				fileName: outputPath(metadata.canonicalPath),
				source: renderMetadataHtml(template, metadata),
			});
		}
	}

	const latestIndex = getTutorialMetadata(latestTutorialVersion);
	emitFile({
		type: 'asset',
		fileName: outputPath('/tutorial/'),
		source: redirectHtml(latestIndex.canonicalUrl, latestIndex.title),
	});
	emitFile({
		type: 'asset',
		fileName: outputPath('/tutorial/latest/'),
		source: redirectHtml(latestIndex.canonicalUrl, latestIndex.title),
	});
	for (const lesson of lessonsByVersion[latestTutorialVersion]) {
		const metadata = getTutorialMetadata(latestTutorialVersion, lesson);
		emitFile({
			type: 'asset',
			fileName: outputPath(`/tutorial/latest/${lesson.slug}/`),
			source: redirectHtml(metadata.canonicalUrl, metadata.title),
		});
	}

	for (const { fileName, source } of discoveryAssets()) {
		emitFile({ type: 'asset', fileName, source });
	}
}

export function tutorialSeoBuildPlugin(): Plugin {
	let htmlTemplate = '';
	return {
		name: 'tutorial-seo-static-pages',
		enforce: 'post' as const,
		configureServer(server) {
			server.middlewares.use((request, response, next) => {
				const pathname = request.url?.split('?')[0];
				if (pathname !== '/sitemap.xml' && pathname !== '/robots.txt') {
					next();
					return;
				}
				const asset = discoveryAssets().find(
					(item) => pathname === `/${item.fileName}`
				);
				if (!asset || !['GET', 'HEAD'].includes(request.method ?? '')) {
					next();
					return;
				}
				response.statusCode = 200;
				response.setHeader('Content-Type', asset.contentType);
				response.end(
					request.method === 'HEAD' ? undefined : asset.source
				);
			});
		},
		transformIndexHtml: {
			order: 'post',
			handler(html) {
				htmlTemplate = renderMetadataHtml(html, getHomeMetadata());
				return htmlTemplate;
			},
		},
		generateBundle() {
			if (!htmlTemplate) {
				throw new Error('Vite did not transform the root index.html.');
			}
			emitStaticTutorialPages(this.emitFile.bind(this), htmlTemplate);
		},
	};
}
