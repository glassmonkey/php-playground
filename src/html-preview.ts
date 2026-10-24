type PreviewColorMode = 'light' | 'dark';

const darkPreviewStyle = `<style data-php-playground-preview-theme>
html {
  background-color: rgb(30, 30, 30);
  color: #d4d4d4;
}
</style>`;

export function applyHtmlPreviewColorMode(
	srcDoc: string,
	colorMode: PreviewColorMode
): string {
	if (colorMode === 'light') {
		return srcDoc;
	}

	if (srcDoc.includes('data-php-playground-preview-theme')) {
		return srcDoc;
	}

	const headEnd = findOpeningTagEnd(srcDoc, 'head');
	if (headEnd !== -1) {
		return insertAt(srcDoc, headEnd, darkPreviewStyle);
	}

	const htmlEnd = findOpeningTagEnd(srcDoc, 'html');
	if (htmlEnd !== -1) {
		return insertAt(srcDoc, htmlEnd, darkPreviewStyle);
	}

	const doctypeMatch = /^\s*<!doctype\s[^>]*>/i.exec(srcDoc);
	if (doctypeMatch) {
		return insertAt(
			srcDoc,
			doctypeMatch.index + doctypeMatch[0].length,
			darkPreviewStyle
		);
	}

	return `${darkPreviewStyle}${srcDoc}`;
}

function findOpeningTagEnd(srcDoc: string, tagName: string): number {
	let index = 0;

	while (index < srcDoc.length) {
		const openingBracket = srcDoc.indexOf('<', index);
		if (openingBracket === -1) {
			return -1;
		}

		if (srcDoc.startsWith('<!--', openingBracket)) {
			const commentEnd = srcDoc.indexOf('-->', openingBracket + 4);
			if (commentEnd === -1) {
				return -1;
			}
			index = commentEnd + 3;
			continue;
		}

		const parsedTag = parseTag(srcDoc, openingBracket);
		if (!parsedTag) {
			index = openingBracket + 1;
			continue;
		}

		if (!parsedTag.isClosing && parsedTag.name === tagName) {
			return parsedTag.end;
		}

		if (
			!parsedTag.isClosing &&
			(parsedTag.name === 'script' || parsedTag.name === 'style')
		) {
			const closingTag = new RegExp(`</${parsedTag.name}\\s*>`, 'ig');
			closingTag.lastIndex = parsedTag.end;
			const closingMatch = closingTag.exec(srcDoc);
			if (!closingMatch) {
				return -1;
			}
			index = closingTag.lastIndex;
			continue;
		}

		index = parsedTag.end;
	}

	return -1;
}

function parseTag(
	srcDoc: string,
	start: number
): { end: number; isClosing: boolean; name: string } | undefined {
	let index = start + 1;
	let isClosing = false;

	if (srcDoc[index] === '/') {
		isClosing = true;
		index += 1;
	}

	const nameStart = index;
	while (isAsciiLetter(srcDoc[index])) {
		index += 1;
	}

	if (index === nameStart) {
		return undefined;
	}

	const name = srcDoc.slice(nameStart, index).toLowerCase();
	if (
		srcDoc[index] !== '>' &&
		!isWhitespace(srcDoc[index]) &&
		srcDoc[index] !== '/'
	) {
		return undefined;
	}

	let quote: '"' | "'" | undefined;
	for (; index < srcDoc.length; index += 1) {
		const character = srcDoc[index];
		if (quote) {
			if (character === quote) {
				quote = undefined;
			}
			continue;
		}

		if (character === '"' || character === "'") {
			quote = character;
		} else if (character === '>') {
			return { end: index + 1, isClosing, name };
		}
	}

	return undefined;
}

function isAsciiLetter(character: string | undefined): boolean {
	return character !== undefined && /^[a-z]$/i.test(character);
}

function isWhitespace(character: string | undefined): boolean {
	return character !== undefined && /\s/.test(character);
}

function insertAt(value: string, index: number, insertion: string): string {
	return `${value.slice(0, index)}${insertion}${value.slice(index)}`;
}
