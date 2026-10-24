// @vitest-environment jsdom
import * as React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
		Box: ({ as, children }: React.PropsWithChildren & { as?: React.ElementType }) =>
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

describe('applyHtmlPreviewColorMode', () => {
	it('returns the original HTML unchanged in light mode', () => {
		const srcDoc = '<!doctype html><p>plain output</p>';

		const got = applyHtmlPreviewColorMode(srcDoc, 'light');

		expect(got).toBe(srcDoc);
	});

	it.each([
		{
			name: 'HTML fragment',
			srcDoc: '<main><p>fragment output</p></main>',
			preserved: '<main><p>fragment output</p></main>',
		},
		{
			name: 'HTML document doctype',
			srcDoc: '<!doctype html><html><head><title>result</title></head><body><p>document output</p></body></html>',
			preserved: '<!doctype html>',
		},
		{
			name: 'HTML document title',
			srcDoc: '<!doctype html><html><head><title>result</title></head><body><p>document output</p></body></html>',
			preserved: '<title>result</title>',
		},
		{
			name: 'HTML document body',
			srcDoc: '<!doctype html><html><head><title>result</title></head><body><p>document output</p></body></html>',
			preserved: '<p>document output</p>',
		},
		{
			name: 'comment containing head-looking text',
			srcDoc: '<!-- <head><style>comment</style></head> --><script>const example = "<head>not markup</head>";</script><p>script output</p>',
			preserved: '<!-- <head><style>comment</style></head> -->',
		},
		{
			name: 'script containing head-looking text',
			srcDoc: '<!-- <head><style>comment</style></head> --><script>const example = "<head>not markup</head>";</script><p>script output</p>',
			preserved: '<script>const example = "<head>not markup</head>";</script>',
		},
		{
			name: 'script output',
			srcDoc: '<!-- <head><style>comment</style></head> --><script>const example = "<head>not markup</head>";</script><p>script output</p>',
			preserved: '<p>script output</p>',
		},
	])('keeps $name when applying dark mode', ({ srcDoc, preserved }) => {
		const got = applyHtmlPreviewColorMode(srcDoc, 'dark');

		expect(got).toContain(preserved);
	});
});

describe('Editor preview output', () => {
	afterEach(() => {
		editorState.colorMode = 'light';
		editorState.result =
			'<!doctype html><html><body><p id="preview">preview</p></body></html>';
	});

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

		expect(screen.getByTestId('preview-html')).toHaveAttribute('sandbox', '');
	});

	it('updates HTML output when the selected color mode changes', () => {
		const { rerender } = render(
			<Editor
				initCode={editorState.code}
				version={versions[versions.length - 1]}
				format="html"
				onChangeCode={vi.fn()}
			/>
		);
		const lightOutput = screen.getByTestId('preview-html').getAttribute('srcdoc');
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

		expect(screen.getByTestId('preview-html').getAttribute('srcdoc')).not.toBe(
			lightOutput
		);
	});
});
