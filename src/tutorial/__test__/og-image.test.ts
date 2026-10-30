import { describe, expect, it } from 'vitest';
import { renderTutorialOgImage } from '../og-image';
import { lessonsByVersion } from '../content';
import type { Lesson } from '../types';

const lesson = JSON.parse(
	JSON.stringify(
		lessonsByVersion['8.5'].find((item) => item.slug === 'variables')
	)
) as Lesson;

describe('structured tutorial OGP images', () => {
	it('renders a deterministic 1200 by 630 PNG from JSON lesson data', () => {
		const image = renderTutorialOgImage('8.5', lesson);
		expect(image).toBeInstanceOf(Uint8Array);
		expect(Array.from(image.slice(0, 8))).toEqual([
			137, 80, 78, 71, 13, 10, 26, 10,
		]);
		const header = new DataView(
			image.buffer,
			image.byteOffset,
			image.byteLength
		);
		expect([header.getUint32(16), header.getUint32(20)]).toEqual([
			1200, 630,
		]);
		expect(
			renderTutorialOgImage(
				'8.5',
				JSON.parse(JSON.stringify(lesson)) as Lesson
			)
		).toEqual(image);
	});
	it.each([
		['title', { title: 'A different lesson title' }],
		['summary', { summary: 'A different lesson summary' }],
	] as const)('reflects a changed %s in rendered bytes', (_field, change) => {
		expect(
			renderTutorialOgImage('8.5', { ...lesson, ...change })
		).not.toEqual(renderTutorialOgImage('8.5', lesson));
	});
	it('distinguishes the PHP version and the chapter index from the lesson', () => {
		expect(renderTutorialOgImage('7.4', lesson)).not.toEqual(
			renderTutorialOgImage('8.5', lesson)
		);
		expect(renderTutorialOgImage('8.5')).not.toEqual(
			renderTutorialOgImage('8.5', lesson)
		);
	});
	it('fits a long unbroken title into a valid share image', () => {
		const image = renderTutorialOgImage('8.5', {
			...lesson,
			title: 'W'.repeat(75),
		});
		const header = new DataView(
			image.buffer,
			image.byteOffset,
			image.byteLength
		);
		expect([header.getUint32(16), header.getUint32(20)]).toEqual([
			1200, 630,
		]);
		expect(Array.from(image.slice(0, 8))).toEqual([
			137, 80, 78, 71, 13, 10, 26, 10,
		]);
	});
	it('rejects a title that cannot fit instead of silently clipping it', () => {
		expect(() =>
			renderTutorialOgImage('8.5', { ...lesson, title: 'W'.repeat(200) })
		).toThrow('OGP title is too long for 8.5/variables:');
	});
	it('renders XML special characters in title and summary as safe text', () => {
		const image = renderTutorialOgImage('8.5', {
			...lesson,
			title: `Compare <PHP> & "strings"`,
			summary: `Use <, >, &, "quotes" and 'apostrophes'; </text><script> is text.`,
		});
		expect(Array.from(image.slice(0, 8))).toEqual([
			137, 80, 78, 71, 13, 10, 26, 10,
		]);
		expect(image).not.toEqual(renderTutorialOgImage('8.5', lesson));
	});
});
