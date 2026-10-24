import { Box } from '@chakra-ui/react';
import * as React from 'react';
import type { Format } from './format';
import type { PreviewTheme } from './preview-theme';

type PreviewProps = {
	result: string;
	format: Format;
	theme: PreviewTheme;
};

export function Preview({ result, format, theme }: PreviewProps) {
	const iframeKey = React.useRef(0);
	const previousResult = React.useRef(result);

	if (previousResult.current !== result) {
		iframeKey.current += 1;
		previousResult.current = result;
	}

	return (
		<Box
			width="100%"
			height="100%"
			position="relative"
			style={{
				backgroundColor: theme.background,
				color: theme.foreground,
				scrollbarGutter: 'stable',
			}}
		>
			{renderPreview(result, format, theme, iframeKey.current)}
		</Box>
	);
}

function renderPreview(
	result: string,
	format: Format,
	theme: PreviewTheme,
	iframeKey: number
): React.ReactNode {
	switch (format) {
		case 'console':
			return (
				<pre
					data-testid="preview-console"
					style={{
						whiteSpace: 'pre-wrap',
						wordBreak: 'break-all',
						overflow: 'auto',
						width: '100%',
						height: '100%',
						boxSizing: 'border-box',
						margin: 0,
						padding: '10px',
						display: 'block',
						border: 'none',
						backgroundColor: theme.background,
						color: theme.foreground,
					}}
				>
					{result}
				</pre>
			);
		case 'html':
			return (
				<iframe
					key={iframeKey}
					data-testid="preview-html"
					srcDoc={applyPreviewTheme(result, theme)}
					height="100%"
					width="100%"
					sandbox=""
					style={{
						boxSizing: 'border-box',
						display: 'block',
						border: 'none',
						margin: 0,
						padding: 0,
					}}
				/>
			);
		default:
			return assertNever(format);
	}
}

function assertNever(value: never): never {
	throw new Error(`Unsupported preview format: ${value}`);
}

function applyPreviewTheme(srcDoc: string, theme: PreviewTheme): string {
	if (theme.mode === 'light') {
		return srcDoc;
	}

	const doc = new DOMParser().parseFromString(srcDoc, 'text/html');
	const style = doc.createElement('style');
	style.textContent = `:where(html) {
  background-color: ${theme.background};
  color: ${theme.foreground};
}`;
	doc.head.prepend(style);

	const serializer = new XMLSerializer();
	return Array.from(doc.childNodes)
		.map((node) =>
			node === doc.documentElement
				? doc.documentElement.outerHTML
				: serializer.serializeToString(node)
		)
		.join('');
}
