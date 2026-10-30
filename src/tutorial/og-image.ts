import { Resvg } from '@resvg/resvg-js';
import { fileURLToPath } from 'node:url';
import type { TutorialVersion } from './config';
import type { Lesson } from './types';
import { lessonsByVersion } from './content';

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
	const title = lesson?.title ?? 'Start with the basics';
	const exampleLesson = lesson ?? lessonsByVersion[version][0];
	const program = exampleLesson.programs[exampleLesson.sampleProgramId];
	if (!program)
		throw new Error(
			`Missing OGP Example for ${version}/${exampleLesson.slug}`
		);
	let titleSize = 34;
	let titleLines = wrap(title, titleSize, 700, 490);
	while (titleLines.length > 3 && titleSize > 18) {
		titleSize -= 2;
		titleLines = wrap(title, titleSize, 700, 490);
	}
	if (titleLines.length > 3)
		throw new Error(
			`OGP title is too long for ${version}/${lesson?.slug ?? ''}: ${title}`
		);
	const titleSvg = titleLines
		.map(
			(line, i) =>
				`<text x="64" y="${399 + i * 40}" font-size="${titleSize}" font-weight="700" fill="#1A202C">${xml(line)}</text>`
		)
		.join('');
	const codeLines = program.code
		.replaceAll('\t', '    ')
		.split(/\r?\n/)
		.filter((line) => line.trim());
	if (codeLines.length > 6) codeLines.splice(5, codeLines.length - 5, '…');
	const codeSvg = codeLines
		.map((line, i) => {
			let shown = line;
			if (width(shown, 21, 400) > 468) {
				while (width(`${shown}…`, 21, 400) > 468)
					shown = shown.slice(0, -1);
				shown += '…';
			}
			return `<text x="638" y="${250 + i * 33}" font-size="21" fill="#E2E8F0" xml:space="preserve">${xml(shown)}</text>`;
		})
		.join('');
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
		<rect width="1200" height="630" fill="#F7FAFC"/>
		<rect width="1200" height="12" fill="#2F855A"/>
		<g font-family="Lato">
			<text x="64" y="78" font-size="30" font-weight="700" fill="#1A202C">PHP Playground</text>
			<rect x="978" y="43" width="158" height="48" rx="10" fill="#C6F6D5"/>
			<text x="1001" y="76" font-size="25" font-weight="700" fill="#22543D">PHP ${xml(version)}</text>
			<text x="64" y="165" font-size="24" font-weight="700" fill="#276749">INTERACTIVE PHP TUTORIAL</text>
			<text x="64" y="244" font-size="64" font-weight="700" fill="#1A202C">Learn PHP</text>
			<text x="64" y="318" font-size="64" font-weight="700" fill="#276749">by doing.</text>
			${titleSvg}
			<rect x="610" y="154" width="526" height="320" rx="16" fill="#1E1E1E"/>
			<rect x="610" y="154" width="526" height="56" rx="16" fill="#2D3748"/>
			<rect x="610" y="183" width="526" height="27" fill="#2D3748"/>
			<text x="638" y="192" font-size="23" font-weight="700" fill="#E2E8F0">Example</text>
			<text x="1050" y="192" font-size="20" fill="#C6F6D5">PHP</text>
			${codeSvg}
			<rect y="517" width="1200" height="113" fill="#E6F5EA"/>
			<text x="64" y="571" font-size="28" font-weight="700" fill="#22543D">Edit an Example. Try an Experiment. Press Run.</text>
			<text x="984" y="608" font-size="22" fill="#4A5568">php-play.dev</text>
		</g>
	</svg>`;
	return new Resvg(svg, { font }).render().asPng();
}
