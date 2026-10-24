import { expect, test, type Page } from '@playwright/test';
import * as lzString from 'lz-string';

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

async function openPreview(page: Page, code: string, colorScheme: 'light' | 'dark') {
	await page.emulateMedia({ colorScheme });
	await page.goto(`${pageURL}/?c=${code}&f=html`);
}

async function previewColors(page: Page) {
	return page
		.frameLocator('[data-testid="preview-html"]')
		.locator('#preview-probe')
		.evaluate((element: Element) => ({
			backgroundColor: getComputedStyle(document.body).backgroundColor,
			color: getComputedStyle(element).color,
		}));
}

test('uses dark default colors for HTML output when the UI theme is dark', async ({ page }) => {
	await openPreview(page, codeWithoutCustomCSS, 'light');
	await page.getByRole('switch').uncheck();

	expect(await previewColors(page)).toEqual({
		backgroundColor: 'rgb(30, 30, 30)',
		color: 'rgb(212, 212, 212)',
	});
});

test('restores the original light HTML appearance when the UI theme switches back', async ({
	page,
}) => {
	await openPreview(page, codeWithoutCustomCSS, 'dark');
	await page.getByRole('switch').check();

	expect(await previewColors(page)).toEqual({
		backgroundColor: 'rgba(0, 0, 0, 0)',
		color: 'rgb(0, 0, 0)',
	});
});

test('keeps user supplied CSS colors in dark mode', async ({ page }) => {
	await openPreview(page, codeWithCustomCSS, 'light');
	await page.getByRole('switch').uncheck();

	expect(await previewColors(page)).toEqual({
		backgroundColor: 'rgb(12, 34, 56)',
		color: 'rgb(210, 220, 230)',
	});
});

test('keeps the HTML preview sandboxed', async ({ page }) => {
	await openPreview(page, codeWithoutCustomCSS, 'light');

	await expect(page.getByTestId('preview-html')).toHaveAttribute('sandbox', '');
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
