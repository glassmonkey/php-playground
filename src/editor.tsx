import type { Version } from './php-wasm/php';
import {
	SandpackLayout,
	SandpackProvider,
	useActiveCode,
	useSandpack,
} from '@codesandbox/sandpack-react';
import { usePHP } from './workers/client';
import {
	Box,
	Center,
	Flex,
	Spinner,
	useColorModeValue,
} from '@chakra-ui/react';
import type { ReactElement } from 'react';
import * as React from 'react';
import MonacoEditor, {
	type OnChange,
	type OnMount,
} from '@monaco-editor/react';
import { Format } from './format';
import debounce from 'debounce';
import { Preview } from './preview';
import type { PreviewTheme } from './preview-theme';
import { LspClient } from './lsp/client';
import { phpactorVersionError } from './lsp/phpactor-version';

export type LspStatus = {
	state: 'off' | 'loading' | 'ready' | 'error';
	message?: string;
};

function traceManualCompletionShortcut(shortcut: string) {
	if (!import.meta.env.DEV) return;
	try {
		if (window.localStorage.getItem('phpactorLspTrace') !== '1') return;
		console.info('[phpactor-lsp]', {
			at_ms: Math.round(performance.now()),
			event: 'manual-shortcut',
			shortcut,
		});
	} catch {
		// Diagnostics are optional and must not affect editor input.
	}
}

function LoadSpinner() {
	return (
		<Center height="100%" width="100%" data-testid="loading-spinner">
			<Spinner size="xl" />
		</Center>
	);
}

function PhpEditor(params: {
	theme: PreviewTheme;
	version: Version;
	lspEnabled: boolean;
	onLspStatus: (status: LspStatus) => void;
}) {
	const { code, updateCode } = useActiveCode();
	const { sandpack } = useSandpack();
	const [monacoInstance, setMonacoInstance] = React.useState<
		Parameters<OnMount>[1] | null
	>(null);
	const [editorInstance, setEditorInstance] = React.useState<
		Parameters<OnMount>[0] | null
	>(null);
	const manualCompletionShortcutAt = React.useRef<number | undefined>(
		undefined
	);

	const onChangeCode: OnChange = debounce((value) => {
		updateCode(value || '');
	}, 300);
	const onMount: OnMount = (editor, monaco) => {
		setEditorInstance(editor);
		setMonacoInstance(monaco);
		editor.onKeyDown((event) => {
			if (
				event.keyCode === monaco.KeyCode.Space &&
				(event.ctrlKey || event.metaKey)
			) {
				manualCompletionShortcutAt.current = performance.now();
				traceManualCompletionShortcut('Ctrl/Command+Space');
			} else if (
				event.keyCode === monaco.KeyCode.Escape &&
				event.altKey
			) {
				traceManualCompletionShortcut('Option+Escape');
			}
		});
	};

	React.useEffect(() => {
		manualCompletionShortcutAt.current = undefined;
		if (!params.lspEnabled || !editorInstance || !monacoInstance) {
			params.onLspStatus({ state: 'off' });
			return;
		}

		let cancelled = false;
		let worker: Worker | undefined;
		let client: LspClient | undefined;
		const model = editorInstance.getModel();
		if (!model) return;
		params.onLspStatus({ state: 'loading' });

		void (async () => {
			try {
				const versionError = phpactorVersionError(params.version);
				if (versionError) {
					params.onLspStatus({
						state: 'error',
						message: versionError,
					});
					return;
				}
				const adapter = await import('./lsp/phpactor');
				if (cancelled) return;
				worker = adapter.createWorker();
				client = await LspClient.connect({
					worker,
					model,
					monaco: monacoInstance,
					phpVersion: params.version,
					getPosition: () => editorInstance.getPosition(),
					consumeManualCompletionShortcut: () => {
						const requestedAt = manualCompletionShortcutAt.current;
						manualCompletionShortcutAt.current = undefined;
						return (
							requestedAt !== undefined &&
							performance.now() - requestedAt < 500
						);
					},
					triggerCompletion: () => {
						if (editorInstance.hasTextFocus())
							editorInstance.trigger(
								'phpactor-lsp',
								'editor.action.triggerSuggest',
								null
							);
					},
					onStatus: (state, message) => {
						if (!cancelled) params.onLspStatus({ state, message });
					},
				});
				if (cancelled) client.dispose();
			} catch {
				worker?.terminate();
				if (!cancelled) {
					params.onLspStatus({
						state: 'error',
						message:
							'Phpactor completion could not be initialized.',
					});
				}
			}
		})();

		return () => {
			cancelled = true;
			if (client) client.dispose();
			else worker?.terminate();
		};
	}, [
		params.lspEnabled,
		params.version,
		editorInstance,
		monacoInstance,
		params.onLspStatus,
	]);

	return (
		<MonacoEditor
			width="100%"
			height="100%"
			language="php"
			theme={params.theme.mode === 'light' ? 'vs' : 'vs-dark'}
			key={sandpack.activeFile}
			defaultValue={code}
			onChange={onChangeCode}
			loading={<LoadSpinner />}
			onMount={onMount}
			options={{
				minimap: {
					enabled: false,
				},
			}}
		/>
	);
}

function PhpPreview(params: {
	version: Version;
	format: Format;
	theme: PreviewTheme;
}) {
	const { sandpack } = useSandpack();
	const { files, activeFile } = sandpack;
	const code = files[activeFile].code;
	const [loading, result] = usePHP(params.version, code);

	if (loading) {
		return <LoadSpinner />;
	}

	return (
		<Preview result={result} format={params.format} theme={params.theme} />
	);
}

function PhpCodeCallback(params: { onChangeCode: (code: string) => void }) {
	const { sandpack } = useSandpack();
	const { files, activeFile } = sandpack;
	const code = files[activeFile].code;
	params.onChangeCode(code);
	return <></>;
}

function EditorLayout(params: {
	Editor: ReactElement;
	Preview: ReactElement;
	theme: PreviewTheme;
}) {
	const surface = useColorModeValue('gray.50', 'gray.800');
	const foreground = useColorModeValue('gray.800', 'gray.100');

	return (
		<Flex
			direction="column"
			padding="3"
			bg={surface}
			color={foreground}
			height="100%"
		>
			<Flex
				justify="space-between"
				direction={{ base: 'column', lg: 'row' }}
				align="center"
				gap="8px"
				height="80vh"
			>
				<Box
					as={SandpackLayout}
					flexDirection={{ base: 'column', lg: 'row' }}
					height={{ base: '50%', lg: '100%' }}
					width={{ base: '100%', lg: '50%' }}
				>
					<Box
						as="span"
						flex="1"
						height="100%"
						maxWidth={{ base: '100%' }}
						position="relative"
						className="group"
					>
						{params.Editor}
					</Box>
				</Box>
				<Box
					height={{ base: '50%', lg: '100%' }}
					width={{ base: '100%', lg: '50%' }}
					style={{
						backgroundColor: params.theme.background,
						color: params.theme.foreground,
						boxSizing: 'border-box',
					}}
				>
					{params.Preview}
				</Box>
			</Flex>
		</Flex>
	);
}

export function Editor(params: {
	initCode: string;
	version: Version;
	format: Format;
	theme: PreviewTheme;
	lspEnabled: boolean;
	onLspStatusChange: (status: LspStatus) => void;
	onChangeCode: (code: string) => void;
}) {
	// SandpackProvider resets its files whenever this object changes, which
	// discards edits still waiting for the debounce. Keep the first one.
	const [files] = React.useState(() => ({ '/app.php': params.initCode }));

	return (
		<SandpackProvider
			template="react"
			files={files}
			options={{
				activeFile: '/app.php', // used to be activePath
				visibleFiles: ['/app.php'], // used to be openPaths
			}}
		>
			<EditorLayout
				theme={params.theme}
				Editor={
					<PhpEditor
						theme={params.theme}
						version={params.version}
						lspEnabled={params.lspEnabled}
						onLspStatus={params.onLspStatusChange}
					/>
				}
				Preview={
					<PhpPreview
						version={params.version}
						format={params.format}
						theme={params.theme}
					/>
				}
			/>
			<PhpCodeCallback onChangeCode={params.onChangeCode} />
		</SandpackProvider>
	);
}
