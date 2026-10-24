type PreviewColorMode = 'light' | 'dark';

const previewThemeAttribute = 'data-php-playground-preview-theme';
const darkPreviewStyle = `:where(html) {
  background-color: rgb(30, 30, 30);
  color: #d4d4d4;
}`;

export function applyHtmlPreviewColorMode(
	srcDoc: string,
	colorMode: PreviewColorMode
): string {
	if (colorMode === 'light') {
		return srcDoc;
	}

	const doc = new DOMParser().parseFromString(srcDoc, 'text/html');
	if (doc.head.querySelector(`style[${previewThemeAttribute}]`)) {
		return srcDoc;
	}

	const style = doc.createElement('style');
	style.setAttribute(previewThemeAttribute, '');
	style.textContent = darkPreviewStyle;
	doc.head.prepend(style);

	return serializeHtmlDocument(doc);
}

function serializeHtmlDocument(doc: Document): string {
	const serializer = new XMLSerializer();
	return Array.from(doc.childNodes)
		.map((node) => {
			if (node === doc.documentElement) {
				return doc.documentElement.outerHTML;
			}
			return serializer.serializeToString(node);
		})
		.join('');
}
