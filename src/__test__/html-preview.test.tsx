// @vitest-environment jsdom
import * as React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyHtmlPreviewColorMode } from '../html-preview';
import { Editor } from '../editor';
import { versions } from '../php-wasm/php';

const editorState = vi.hoisted(() => ({
	colorMode: 'light' as 'light' | 'dark',
	code: '<?php echo "preview";',
	result: '<!doctype html><html><body><p id="preview">preview</p></body></html>',
}));

vi.mock('@chakra-ui/react', async () => {
	const passthrough = ({ children }: React.PropsWithChildren) =>
		React.createElement('div', undefined, children);
	return {
		Box: ({
			as,
			children,
		}: React.PropsWithChildren & { as?: React.ElementType }) =>
			React.createElement(as ?? 'div', undefined, children),
		Center: passthrough,
		Flex: passthrough,
		Spinner: () => React.createElement('div'),
		useColorMode: () => ({ colorMode: editorState.colorMode }),
	};
});

vi.mock('@codesandbox/sandpack-react', async () => {
	const ReactModule = await import('react');
	return {
		SandpackLayout: ({ children }: React.PropsWithChildren) =>
			ReactModule.createElement('div', undefined, children),
		SandpackProvider: ({ children }: React.PropsWithChildren) =>
			ReactModule.createElement('div', undefined, children),
		useActiveCode: () => ({ code: editorState.code, updateCode: vi.fn() }),
		useSandpack: () => ({
			sandpack: {
				activeFile: '/app.php',
				files: { '/app.php': { code: editorState.code } },
			},
		}),
	};
});

vi.mock('@monaco-editor/react', () => ({
	default: () => React.createElement('div', { 'data-testid': 'code-editor' }),
}));

vi.mock('../workers/client', () => ({
	usePHP: () => [false, editorState.result],
}));

beforeEach(() => {
	editorState.colorMode = 'light';
	editorState.code = '<?php echo "preview";';
	editorState.result =
		'<!doctype html><html><body><p id="preview">preview</p></body></html>';
});

afterEach(() => {
	cleanup();
});

describe('applyHtmlPreviewColorMode', () => {
	it('returns the original HTML unchanged in light mode', () => {
		const srcDoc = '<!doctype html><p>plain output</p>';

		const got = applyHtmlPreviewColorMode(srcDoc, 'light');

		expect(got).toBe(srcDoc);
	});

	it.each([
		{
			name: 'HTML fragment content',
			srcDoc: '<main id="fragment-probe"><p>fragment output</p></main>',
			select: '#fragment-probe',
			value: 'fragment output',
		},
	])('keeps $name when applying dark mode', ({ srcDoc, select, value }) => {
		const got = applyHtmlPreviewColorMode(srcDoc, 'dark');
		const document = new DOMParser().parseFromString(got, 'text/html');

		expect(document.querySelector(select)?.textContent).toBe(value);
	});

	it('keeps standards mode when dark output contains a doctype', () => {
		const srcDoc =
			'<!doctype html><html><body><p id="doctype-probe">document output</p></body></html>';
		const got = applyHtmlPreviewColorMode(srcDoc, 'dark');
		const document = new DOMParser().parseFromString(got, 'text/html');

		expect({
			doctype: document.doctype?.name,
			compatMode: document.compatMode,
			content: document.querySelector('#doctype-probe')?.textContent,
		}).toEqual({
			doctype: 'html',
			compatMode: 'CSS1Compat',
			content: 'document output',
		});
	});

	it('keeps title and textarea text that resembles head markup', () => {
		const srcDoc =
			'<!doctype html><html><head><title>title marker __HTML_PREVIEW_COLOR_MODE__ <head>literal</head></title></head><body><textarea id="rawtext-probe">textarea marker __HTML_PREVIEW_COLOR_MODE__ <head>literal</head></textarea></body></html>';
		const got = applyHtmlPreviewColorMode(srcDoc, 'dark');
		const document = new DOMParser().parseFromString(got, 'text/html');

		expect({
			title: document.title,
			textarea: (
				document.querySelector('#rawtext-probe') as HTMLTextAreaElement
			).value,
		}).toEqual({
			title: 'title marker __HTML_PREVIEW_COLOR_MODE__ <head>literal</head>',
			textarea:
				'textarea marker __HTML_PREVIEW_COLOR_MODE__ <head>literal</head>',
		});
	});

	it('keeps marker-like body text and comment content in the parsed HTML', () => {
		const srcDoc =
			'<!doctype html><html><body><p id="body-probe">body marker __HTML_PREVIEW_COLOR_MODE__ &lt;head&gt;literal&lt;/head&gt;</p><div id="comment-probe"><!-- comment marker __HTML_PREVIEW_COLOR_MODE__ <head>literal</head> --></div></body></html>';
		const got = applyHtmlPreviewColorMode(srcDoc, 'dark');
		const document = new DOMParser().parseFromString(got, 'text/html');

		expect({
			body: document.querySelector('#body-probe')?.textContent,
			comment:
				document.querySelector('#comment-probe')?.firstChild
					?.textContent,
		}).toEqual({
			body: 'body marker __HTML_PREVIEW_COLOR_MODE__ <head>literal</head>',
			comment:
				' comment marker __HTML_PREVIEW_COLOR_MODE__ <head>literal</head> ',
		});
	});
});

describe('Editor preview output', () => {
	it('keeps the raw PHP result in console mode', () => {
		editorState.result = '  Notice: raw console output\n';
		render(
			<Editor
				initCode={editorState.code}
				version={versions[versions.length - 1]}
				format="console"
				onChangeCode={vi.fn()}
			/>
		);

		expect(screen.getByTestId('preview-console').textContent).toBe(
			'  Notice: raw console output\n'
		);
	});

	it('passes light HTML output through unchanged', () => {
		render(
			<Editor
				initCode={editorState.code}
				version={versions[versions.length - 1]}
				format="html"
				onChangeCode={vi.fn()}
			/>
		);
		expect(screen.getByTestId('preview-html').getAttribute('srcdoc')).toBe(
			editorState.result
		);
	});

	it('retains sandboxing for HTML preview output', () => {
		render(
			<Editor
				initCode={editorState.code}
				version={versions[versions.length - 1]}
				format="html"
				onChangeCode={vi.fn()}
			/>
		);

		expect(screen.getByTestId('preview-html')).toHaveAttribute(
			'sandbox',
			''
		);
	});

	it('updates parsed HTML in dark mode and restores the original HTML in light mode', () => {
		const lightSource = editorState.result;
		const { rerender } = render(
			<Editor
				initCode={editorState.code}
				version={versions[versions.length - 1]}
				format="html"
				onChangeCode={vi.fn()}
			/>
		);
		act(() => {
			editorState.colorMode = 'dark';
		});
		rerender(
			<Editor
				initCode={editorState.code}
				version={versions[versions.length - 1]}
				format="html"
				onChangeCode={vi.fn()}
			/>
		);
		const darkOutput = screen
			.getByTestId('preview-html')
			.getAttribute('srcdoc');
		const darkDocument = new DOMParser().parseFromString(
			darkOutput ?? '',
			'text/html'
		);
		const darkView = {
			doctype: darkDocument.doctype?.name,
			compatMode: darkDocument.compatMode,
			previewText: darkDocument.querySelector('#preview')?.textContent,
		};

		act(() => {
			editorState.colorMode = 'light';
		});
		rerender(
			<Editor
				initCode={editorState.code}
				version={versions[versions.length - 1]}
				format="html"
				onChangeCode={vi.fn()}
			/>
		);

		expect({
			dark: darkView,
			light: screen.getByTestId('preview-html').getAttribute('srcdoc'),
		}).toEqual({
			dark: {
				doctype: 'html',
				compatMode: 'CSS1Compat',
				previewText: 'preview',
			},
			light: lightSource,
		});
	});
});
