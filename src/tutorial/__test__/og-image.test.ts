import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from '@playwright/test';
import { renderTutorialOgImage } from '../og-image';
import { lessonsByVersion } from '../content';
import { decodePng } from './image-decoder';

let browser: Browser;
let page: Page;
beforeAll(async () => {
	browser = await chromium.launch();
	page = await browser.newPage();
});
afterAll(async () => {
	await browser?.close();
});

const lesson = () =>
	structuredClone(
		lessonsByVersion['8.5'].find((entry) => entry.slug === 'variables')!
	);

describe('structured tutorial OGP images', () => {
	it.each([
		{
			name: 'ordinary title',
			title: 'Store values in variables',
			code: '<?php echo 12.5;',
		},
		{
			name: 'long unbroken title',
			title: 'W'.repeat(75),
			code: '<?php echo 12.5;',
		},
		{
			name: 'XML special characters',
			title: 'Compare <PHP> & "strings"',
			code: `<?php echo '<, >, &, "quotes"; </text><script>';`,
		},
	])(
		'produces a decodable 1200 by 630 PNG for $name',
		async ({ title, code }) => {
			const value = lesson();
			value.title = title;
			value.programs[value.sampleProgramId].code = code;
			const image = renderTutorialOgImage('8.5', value);
			// This checks decoding and dimensions, not clipping or literal text layout.
			expect(await decodePng(page, image)).toEqual({
				width: 1200,
				height: 630,
			});
		}
	);
	it('rejects a header-only impostor through the independent decoder', async () => {
		// PNG signature/IHDR dimensions alone are insufficient (W3C PNG structure).
		// https://www.w3.org/TR/PNG-Structure.html
		const bytes = Buffer.from(
			'89504e470d0a1a0a0000000d49484452000004b000000276',
			'hex'
		);
		await expect(decodePng(page, bytes)).rejects.toThrow(Error);
	});
	it('renders deterministically from JSON lesson data', () => {
		const value = lesson();
		expect(
			renderTutorialOgImage('8.5', JSON.parse(JSON.stringify(value)))
		).toEqual(renderTutorialOgImage('8.5', value));
	});
	it('rejects a title over the renderer limit', () => {
		expect(() =>
			renderTutorialOgImage('8.5', {
				...lesson(),
				title: 'W'.repeat(200),
			})
		).toThrow('OGP title is too long for 8.5/variables:');
	});
});
