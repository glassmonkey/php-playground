import { Resvg } from '@resvg/resvg-js';
import { fileURLToPath } from 'node:url';
import type { TutorialVersion } from './config';
import type { Lesson } from './types';
import { chapters } from './chapters';

// Build/server only. Bundled fonts keep output independent of the host OS.
const font = {
	loadSystemFonts: false,
	fontFiles: [
		fileURLToPath(new URL('./og-fonts/Lato-Regular.ttf', import.meta.url)),
		fileURLToPath(new URL('./og-fonts/Lato-Bold.ttf', import.meta.url)),
	],
	defaultFontFamily: 'Lato',
};

function xml(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function width(text: string, size: number, weight: number): number {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="200"><text x="0" y="100" font-family="Lato" font-size="${size}" font-weight="${weight}">${xml(text)}</text></svg>`;
	return new Resvg(svg, { font }).getBBox()?.width ?? 0;
}

function wrap(
	text: string,
	size: number,
	weight: number,
	maxWidth: number
): string[] {
	const lines: string[] = [];
	let line = '';
	for (const word of text.trim().split(/\s+/u)) {
		const candidate = line ? `${line} ${word}` : word;
		if (width(candidate, size, weight) <= maxWidth) {
			line = candidate;
			continue;
		}
		if (line) lines.push(line);
		line = '';
		// Also handle identifiers/URLs with no spaces without clipping.
		for (const character of word) {
			if (line && width(line + character, size, weight) > maxWidth) {
				lines.push(line);
				line = '';
			}
			line += character;
		}
	}
	if (line) lines.push(line);
	return lines;
}

/** Generates a share image from JSON-serializable lesson fields, without running PHP. */
export function renderTutorialOgImage(
	version: TutorialVersion,
	lesson?: Lesson
): Uint8Array {
	const title = lesson?.title ?? 'Learn PHP in your browser';
	const summary =
		lesson?.summary ??
		'Explore interactive examples and experiments. Edit the code, predict the result, then run it yourself.';
	const chapter = lesson
		? chapters.find((item) => item.id === lesson.chapterId)?.title
		: 'Interactive tutorial';
	let titleSize = 64;
	let titleLines = wrap(title, titleSize, 700, 1056);
	while (titleLines.length > 3 && titleSize > 36) {
		titleSize -= 4;
		titleLines = wrap(title, titleSize, 700, 1056);
	}
	if (titleLines.length > 3) {
		throw new Error(
			`OGP title is too long for ${version}/${lesson?.slug ?? ''}: ${title}`
		);
	}
	const summaryLines = wrap(summary, 28, 400, 1056);
	if (summaryLines.length > 2) {
		summaryLines.length = 2;
		let last = summaryLines[1];
		while (width(`${last}…`, 28, 400) > 1056) last = last.slice(0, -1);
		summaryLines[1] = `${last}…`;
	}
	const titleSvg = titleLines
		.map(
			(line, i) =>
				`<text x="72" y="${226 + i * 74}" font-size="${titleSize}" font-weight="700" fill="#1A202C">${xml(line)}</text>`
		)
		.join('');
	const summaryY = Math.max(350, 226 + (titleLines.length - 1) * 74 + 56);
	const summarySvg = summaryLines
		.map(
			(line, i) =>
				`<text x="72" y="${summaryY + i * 39}" font-size="28" fill="#4A5568">${xml(line)}</text>`
		)
		.join('');
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
		<rect width="1200" height="630" fill="#F7FAFC"/>
		<rect width="1200" height="12" fill="#2F855A"/>
		<g font-family="Lato">
			<text x="72" y="87" font-size="32" font-weight="700" fill="#1A202C">PHP Playground</text>
			<rect x="936" y="44" width="192" height="60" rx="12" fill="#C6F6D5"/>
			<text x="1032" y="83" text-anchor="middle" font-size="28" font-weight="700" fill="#22543D">PHP ${xml(version)}</text>
			<text x="72" y="154" font-size="22" fill="#276749">${xml(chapter ?? 'Interactive tutorial')}</text>
			${titleSvg}${summarySvg}
			<path d="M72 526H1128" stroke="#CBD5E0"/>
			<text x="72" y="577" font-size="24" font-weight="700" fill="#276749">Example · Experiment · Run</text>
			<text x="1128" y="577" text-anchor="end" font-size="24" fill="#4A5568">php-play.dev</text>
		</g>
	</svg>`;
	return new Resvg(svg, { font }).render().asPng();
}
