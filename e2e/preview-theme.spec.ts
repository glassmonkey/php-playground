import { expect, test, type Page } from '@playwright/test';
import lzString from 'lz-string';

const pageURL =
	process.env.PLAYWRIGHT_BASE_URL ??
	`http://127.0.0.1:${process.env.PORT ?? '8888'}`;
const outputWithCustomCSS = `<!doctype html><html><head><title>theme preview</title><style>body { background: rgb(12, 34, 56); color: rgb(210, 220, 230); }</style></head><body><main id="preview-probe">theme probe</main></body></html>`;
const codeWithCustomCSS = lzString.compressToEncodedURIComponent(
	`<?php echo '${outputWithCustomCSS}';`
);
const outputWithoutCustomCSS =
	'<!doctype html><p id="preview-probe">theme probe</p>';
const codeWithoutCustomCSS = lzString.compressToEncodedURIComponent(
	`<?php echo '${outputWithoutCustomCSS}';`
);
const outputWithParserEdgeCases =
	'<!doctype html><html><head><title>title marker __HTML_PREVIEW_COLOR_MODE__ &lt;head&gt;literal&lt;/head&gt;</title></head><body><p id="body-probe">body marker __HTML_PREVIEW_COLOR_MODE__ data-php-playground-preview-theme &lt;head&gt;literal&lt;/head&gt;</p><div id="comment-probe"><!-- comment marker __HTML_PREVIEW_COLOR_MODE__ data-php-playground-preview-theme <head>literal</head> --></div><textarea id="textarea-probe">textarea marker __HTML_PREVIEW_COLOR_MODE__ <head>literal</head></textarea></body></html>';
const codeWithParserEdgeCases = lzString.compressToEncodedURIComponent(
	`<?php echo '${outputWithParserEdgeCases}';`
);
const imageResourceURL =
	'https://preview-resources.invalid/parser-side-effect-image.png';
const iframeResourceURL =
	'https://preview-resources.invalid/parser-side-effect-frame.html';
const outputWithExternalResources = `<!doctype html><html><body><img src="${imageResourceURL}" onload="window.__previewEventHandlerRan = true" onerror="window.__previewEventHandlerRan = true"><iframe src="${iframeResourceURL}"></iframe><script>window.__previewScriptRan = true;</script><p>resource fixture</p></body></html>`;
const codeWithExternalResources = lzString.compressToEncodedURIComponent(
	`<?php echo '${outputWithExternalResources}';`
);

async function openPreview(
	page: Page,
	code: string,
	colorScheme: 'light' | 'dark'
) {
	await page.emulateMedia({ colorScheme });
	await page.goto(`${pageURL}/?c=${code}&f=html`);
}

async function toggleUITheme(page: Page) {
	await page
		.getByText('UI Theme:')
		.locator('..')
		.getByRole('checkbox')
		.locator('..')
		.click();
}

async function previewColors(page: Page) {
	return page
		.frameLocator('[data-testid="preview-html"]')
		.locator('#preview-probe')
		.evaluate((element: Element) => ({
			htmlBackgroundColor: getComputedStyle(document.documentElement)
				.backgroundColor,
			bodyBackgroundColor: getComputedStyle(document.body)
				.backgroundColor,
			bodyColor: getComputedStyle(document.body).color,
			probeColor: getComputedStyle(element).color,
		}));
}

test('uses dark default colors for HTML output when the UI theme is dark', async ({
	page,
}) => {
	await openPreview(page, codeWithoutCustomCSS, 'light');
	await toggleUITheme(page);

	await expect
		.poll(() => previewColors(page))
		.toEqual({
			htmlBackgroundColor: 'rgb(30, 30, 30)',
			bodyBackgroundColor: 'rgba(0, 0, 0, 0)',
			bodyColor: 'rgb(212, 212, 212)',
			probeColor: 'rgb(212, 212, 212)',
		});
});

test('restores the original light HTML appearance when the UI theme switches back', async ({
	page,
}) => {
	await openPreview(page, codeWithoutCustomCSS, 'dark');
	await toggleUITheme(page);

	await expect
		.poll(() => previewColors(page))
		.toEqual({
			htmlBackgroundColor: 'rgba(0, 0, 0, 0)',
			bodyBackgroundColor: 'rgba(0, 0, 0, 0)',
			bodyColor: 'rgb(0, 0, 0)',
			probeColor: 'rgb(0, 0, 0)',
		});
});

test('keeps user supplied CSS colors in dark mode', async ({ page }) => {
	await openPreview(page, codeWithCustomCSS, 'light');
	await toggleUITheme(page);

	await expect
		.poll(() => previewColors(page))
		.toEqual({
			htmlBackgroundColor: 'rgb(30, 30, 30)',
			bodyBackgroundColor: 'rgb(12, 34, 56)',
			bodyColor: 'rgb(210, 220, 230)',
			probeColor: 'rgb(210, 220, 230)',
		});
});

test('preserves parsed doctype, title, textarea, body marker, and comment content', async ({
	page,
}) => {
	await openPreview(page, codeWithParserEdgeCases, 'light');
	await toggleUITheme(page);

	const parsedOutput = await page
		.frameLocator('[data-testid="preview-html"]')
		.locator('body')
		.evaluate(() => ({
			doctype: document.doctype?.name,
			compatMode: document.compatMode,
			htmlBackgroundColor: getComputedStyle(document.documentElement)
				.backgroundColor,
			bodyBackgroundColor: getComputedStyle(document.body)
				.backgroundColor,
			bodyColor: getComputedStyle(document.body).color,
			title: document.title,
			textarea: (
				document.querySelector('#textarea-probe') as HTMLTextAreaElement
			).value,
			bodyMarker: document.querySelector('#body-probe')?.textContent,
			commentMarker:
				document.querySelector('#comment-probe')?.firstChild
					?.textContent,
		}));

	expect(parsedOutput).toEqual({
		doctype: 'html',
		compatMode: 'CSS1Compat',
		htmlBackgroundColor: 'rgb(30, 30, 30)',
		bodyBackgroundColor: 'rgba(0, 0, 0, 0)',
		bodyColor: 'rgb(212, 212, 212)',
		title: 'title marker __HTML_PREVIEW_COLOR_MODE__ <head>literal</head>',
		textarea:
			'textarea marker __HTML_PREVIEW_COLOR_MODE__ <head>literal</head>',
		bodyMarker:
			'body marker __HTML_PREVIEW_COLOR_MODE__ data-php-playground-preview-theme <head>literal</head>',
		commentMarker:
			' comment marker __HTML_PREVIEW_COLOR_MODE__ data-php-playground-preview-theme <head>literal</head> ',
	});
});

test('dark processing does not fetch resources or execute scripts in the parent page', async ({
	page,
}) => {
	type ObservedRequest = {
		url: string;
		source: 'parent' | 'preview' | 'unknown';
	};
	const observedRequests: ObservedRequest[] = [];
	await page.addInitScript(() => {
		const pageWindow = window as Window & {
			__previewScriptRan?: boolean;
			__previewEventHandlerRan?: boolean;
		};
		pageWindow.__previewScriptRan = false;
		pageWindow.__previewEventHandlerRan = false;
	});
	await page.route('https://preview-resources.invalid/**', async (route) => {
		let source: ObservedRequest['source'] = 'unknown';
		try {
			source =
				route.request().frame() === page.mainFrame()
					? 'parent'
					: 'preview';
		} catch {
			// Keep detached-frame requests visible in the assertion as unknown.
		}
		observedRequests.push({ url: route.request().url(), source });
		if (route.request().url() === imageResourceURL) {
			await route.fulfill({
				status: 200,
				contentType: 'image/svg+xml',
				body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>',
			});
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: 'text/html',
			body: '<!doctype html><p>nested frame fixture</p>',
		});
	});

	const initialImageRequest = page.waitForRequest(imageResourceURL);
	const initialIframeRequest = page.waitForRequest(iframeResourceURL);
	await openPreview(page, codeWithExternalResources, 'light');
	await expect(page.getByTestId('preview-html')).toBeVisible();
	await Promise.all([initialImageRequest, initialIframeRequest]);
	const lightRequests = observedRequests.splice(0);

	await toggleUITheme(page);
	await expect
		.poll(async () => {
			const darkHtmlBackground = await page
				.frameLocator('[data-testid="preview-html"]')
				.locator('html')
				.evaluate(
					(element) => getComputedStyle(element).backgroundColor
				);
			const parentWindow = await page.evaluate(() => {
				const pageWindow = window as Window & {
					__previewScriptRan?: boolean;
					__previewEventHandlerRan?: boolean;
				};
				return {
					scriptRan: pageWindow.__previewScriptRan,
					eventHandlerRan: pageWindow.__previewEventHandlerRan,
				};
			});
			const darkRequests = observedRequests;

			return {
				lightParentRequests: lightRequests
					.filter(({ source }) => source === 'parent')
					.map(({ url }) => url),
				lightPreviewImageRequests: lightRequests.filter(
					({ url, source }) =>
						url === imageResourceURL && source === 'preview'
				).length,
				lightUnknownRequests: lightRequests
					.filter(({ source }) => source === 'unknown')
					.map(({ url }) => url),
				darkParentRequests: darkRequests
					.filter(({ source }) => source === 'parent')
					.map(({ url }) => url),
				darkUnknownRequests: darkRequests
					.filter(({ source }) => source === 'unknown')
					.map(({ url }) => url),
				darkPreviewImageRequests: darkRequests.filter(
					({ url, source }) =>
						url === imageResourceURL && source === 'preview'
				).length,
				darkIframeRequests: darkRequests.filter(
					({ url }) => url === iframeResourceURL
				).length,
				darkHtmlBackground,
				parentWindow,
			};
		})
		.toEqual({
			lightParentRequests: [],
			lightPreviewImageRequests: 1,
			lightUnknownRequests: [],
			darkParentRequests: [],
			darkUnknownRequests: [],
			darkPreviewImageRequests: 1,
			darkIframeRequests: 1,
			darkHtmlBackground: 'rgb(30, 30, 30)',
			parentWindow: { scriptRan: false, eventHandlerRan: false },
		});
});

test('keeps the HTML preview sandboxed', async ({ page }) => {
	await openPreview(page, codeWithoutCustomCSS, 'light');

	await expect(page.getByTestId('preview-html')).toHaveAttribute(
		'sandbox',
		''
	);
});

test('shows the raw PHP result when switching from HTML to console output', async ({
	page,
}) => {
	await openPreview(page, codeWithCustomCSS, 'light');
	await page.getByTestId('checkbox-format').uncheck();

	expect(await page.getByTestId('preview-console').textContent()).toBe(
		outputWithCustomCSS
	);
});
