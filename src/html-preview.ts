type PreviewColorMode = 'light' | 'dark';

const darkHtmlPreviewStyle = `<style data-php-playground-preview-theme>
html {
  border: 1px solid #efefef;
  border-bottom: 2px solid #efefef;
  border-radius: 4px;
  height: 99.5%;
  background-color: rgb(30, 30, 30);
  color: #d4d4d4;
}
</style>`;

export function applyHtmlPreviewColorMode(
	srcDoc: string,
	colorMode: PreviewColorMode
): string {
	if (colorMode !== 'dark') {
		return srcDoc;
	}
	if (srcDoc.includes('data-php-playground-preview-theme')) {
		return srcDoc;
	}
	return insertPreviewStyle(srcDoc, darkHtmlPreviewStyle);
}

function insertPreviewStyle(srcDoc: string, style: string): string {
	const headMatch = srcDoc.match(/<head(?:\s[^>]*)?>/i);
	if (headMatch?.index !== undefined) {
		return insertAt(srcDoc, headMatch.index + headMatch[0].length, style);
	}

	const htmlMatch = srcDoc.match(/<html(?:\s[^>]*)?>/i);
	if (htmlMatch?.index !== undefined) {
		return insertAt(srcDoc, htmlMatch.index + htmlMatch[0].length, style);
	}

	const doctypeMatch = srcDoc.match(/^\s*<!doctype[^>]*>/i);
	if (doctypeMatch?.index !== undefined) {
		return insertAt(
			srcDoc,
			doctypeMatch.index + doctypeMatch[0].length,
			style
		);
	}

	return `${style}${srcDoc}`;
}

function insertAt(value: string, index: number, insertion: string): string {
	return `${value.slice(0, index)}${insertion}${value.slice(index)}`;
}
