import { lessonsByVersion } from './content';
import {
	isTutorialVersion,
	latestTutorialVersion,
	tutorialVersions,
} from './config';
import { getHomeMetadata, getTutorialMetadata, SITE_ORIGIN } from './seo';
import type { Plugin } from 'vite';
import { renderTutorialOgImage } from './og-image';

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
	html = replaceExactlyOne(
		html,
		/<meta\s+property=["']og:image["'][^>]*>/gi,
		`<meta property="og:image" content="${escapeAttribute(metadata.imageUrl)}">`,
		'Open Graph image'
	);
	html = replaceExactlyOne(
		html,
		/<meta\s+name=["']twitter:image["'][^>]*>/gi,
		`<meta name="twitter:image" content="${escapeAttribute(metadata.imageUrl)}">`,
		'Twitter image'
	);
	html = replaceExactlyOne(
		html,
		/<meta\s+property=["']og:image:alt["'][^>]*>/gi,
		`<meta property="og:image:alt" content="${escapeAttribute(metadata.imageAlt)}">`,
		'Open Graph image alt'
	);
	html = replaceExactlyOne(
		html,
		/<meta\s+name=["']twitter:image:alt["'][^>]*>/gi,
		`<meta name="twitter:image:alt" content="${escapeAttribute(metadata.imageAlt)}">`,
		'Twitter image alt'
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
		source: string | Uint8Array;
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
		emitFile({
			type: 'asset',
			fileName: `${indexMetadata.canonicalPath.replace(/^\/+|\/+$/g, '')}/og.png`,
			source: renderTutorialOgImage(version),
		});
		for (const lesson of lessonsByVersion[version]) {
			const metadata = getTutorialMetadata(version, lesson);
			emitFile({
				type: 'asset',
				fileName: outputPath(metadata.canonicalPath),
				source: renderMetadataHtml(template, metadata),
			});
			emitFile({
				type: 'asset',
				fileName: `${metadata.canonicalPath.replace(/^\/+|\/+$/g, '')}/og.png`,
				source: renderTutorialOgImage(version, lesson),
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

function renderDevelopmentHtml(html: string, requestUrl: string): string {
	const pathname = new URL(requestUrl, SITE_ORIGIN).pathname;
	if (pathname !== '/tutorial' && !pathname.startsWith('/tutorial/')) {
		return renderMetadataHtml(html, getHomeMetadata());
	}
	const match = pathname.match(/^\/tutorial(?:\/([^/]+))?(?:\/([^/]+))?\/?$/);
	const version =
		!match?.[1] || match[1] === 'latest' ? latestTutorialVersion : match[1];
	if (match && isTutorialVersion(version)) {
		const slug = match[2];
		const lesson = lessonsByVersion[version].find(
			(item) => item.slug === slug
		);
		if (!slug || lesson) {
			return renderMetadataHtml(
				html,
				getTutorialMetadata(version, lesson)
			);
		}
	}
	return html
		.replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '')
		.replace(/<meta\s+property=["']og:url["'][^>]*>/gi, '')
		.replace('</head>', '<meta name="robots" content="noindex"></head>');
}

export function tutorialSeoBuildPlugin(): Plugin {
	let htmlTemplate = '';
	return {
		name: 'tutorial-seo-static-pages',
		enforce: 'post' as const,
		configureServer(server) {
			server.middlewares.use((request, response, next) => {
				const pathname = request.url?.split('?')[0];
				const imageMatch = pathname?.match(
					/^\/tutorial\/([^/]+)(?:\/([^/]+))?\/og\.png$/
				);
				if (imageMatch) {
					if (!['GET', 'HEAD'].includes(request.method ?? '')) {
						next();
						return;
					}
					const version = imageMatch[1];
					const slug = imageMatch[2];
					const lesson = slug
						? isTutorialVersion(version)
							? lessonsByVersion[version].find(
									(item) => item.slug === slug
								)
							: undefined
						: undefined;
					if (!isTutorialVersion(version) || (slug && !lesson)) {
						response.statusCode = 404;
						response.setHeader(
							'Content-Type',
							'text/plain; charset=utf-8'
						);
						response.end('Not found');
						return;
					}
					const image = renderTutorialOgImage(version, lesson);
					response.statusCode = 200;
					response.setHeader('Content-Type', 'image/png');
					response.setHeader('Content-Length', image.byteLength);
					response.setHeader('Cache-Control', 'no-store');
					response.end(request.method === 'HEAD' ? undefined : image);
					return;
				}
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
			handler(html, context) {
				if (context?.server) {
					return renderDevelopmentHtml(
						html,
						context.originalUrl ?? context.path
					);
				}
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
