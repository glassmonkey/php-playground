import { describe, expect, it } from 'vitest';
import { applyHtmlPreviewColorMode } from '../html-preview';

describe('applyHtmlPreviewColorMode', () => {
	it('leaves light mode previews unchanged', () => {
		const srcDoc = '<h1>Hello</h1>';

		expect(applyHtmlPreviewColorMode(srcDoc, 'light')).toBe(srcDoc);
	});

	it('adds dark preview styles to document fragments', () => {
		const srcDoc = '<h1>Hello</h1>';
		const themedSrcDoc = applyHtmlPreviewColorMode(srcDoc, 'dark');

		expect(themedSrcDoc).toContain('data-php-playground-preview-theme');
		expect(themedSrcDoc).toContain('background-color: rgb(30, 30, 30)');
		expect(themedSrcDoc).toContain('color: #d4d4d4');
		expect(themedSrcDoc.endsWith(srcDoc)).toBe(true);
	});

	it('injects dark preview styles inside the head when present', () => {
		const srcDoc =
			'<!doctype html><html><head><title>x</title></head><body>x</body></html>';
		const themedSrcDoc = applyHtmlPreviewColorMode(srcDoc, 'dark');

		expect(themedSrcDoc).toContain(
			'<head><style data-php-playground-preview-theme>'
		);
		expect(themedSrcDoc.startsWith('<!doctype html>')).toBe(true);
	});

	it('does not inject the dark preview styles twice', () => {
		const srcDoc = applyHtmlPreviewColorMode('<h1>Hello</h1>', 'dark');

		expect(applyHtmlPreviewColorMode(srcDoc, 'dark')).toBe(srcDoc);
	});
});
