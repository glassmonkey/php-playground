import type { Version } from './php-wasm/php';
import {
	SandpackLayout,
	SandpackProvider,
	useActiveCode,
	useSandpack,
} from '@codesandbox/sandpack-react';
import { usePHP } from './workers/client';
import { Box, Center, Flex, Select, Spinner, Text } from '@chakra-ui/react';
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

type LspMode = 'off' | 'phpantom';
type LspStatus = {
	state: 'off' | 'loading' | 'ready' | 'error';
	message?: string;
};

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
	lspMode: LspMode;
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

	const onChangeCode: OnChange = debounce((value) => {
		updateCode(value || '');
	}, 300);
	const onMount: OnMount = (editor, monaco) => {
		setEditorInstance(editor);
		setMonacoInstance(monaco);
	};

	React.useEffect(() => {
		if (params.lspMode === 'off' || !editorInstance || !monacoInstance) {
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
				const adapter = await import('./lsp/phpantom');
				if (cancelled) return;
				worker = adapter.createWorker();
				client = await LspClient.connect({
					worker,
					model,
					monaco: monacoInstance,
					phpVersion: params.version,
					onStatus: (state, message) => {
						if (!cancelled) params.onLspStatus({ state, message });
					},
				});
				if (cancelled) client.dispose();
			} catch (error) {
				worker?.terminate();
				if (!cancelled) {
					params.onLspStatus({
						state: 'error',
						message:
							error instanceof Error
								? error.message
								: String(error),
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
		params.lspMode,
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
	lspMode: LspMode;
	lspStatus: LspStatus;
	onLspModeChange: (mode: LspMode) => void;
}) {
	return (
		<Flex direction="column" padding="3" bg="gray.800" height="100%">
			<Flex align="center" gap="3" paddingBottom="3" flexWrap="wrap">
				<Text fontSize="sm">LSP preview:</Text>
				<Select
					aria-label="LSP preview mode"
					value={params.lspMode}
					onChange={(event) =>
						params.onLspModeChange(event.target.value as LspMode)
					}
					width="180px"
					size="sm"
				>
					<option value="off">Off</option>
					<option value="phpantom">PHPantom (preview)</option>
				</Select>
				<Text fontSize="sm" role="status" aria-live="polite">
					{params.lspStatus.state === 'off' && 'Off'}
					{params.lspStatus.state === 'loading' &&
						'PHPantom loading…'}
					{params.lspStatus.state === 'ready' && 'PHPantom ready'}
					{params.lspStatus.state === 'error' &&
						`PHPantom error: ${params.lspStatus.message}`}
				</Text>
				{params.lspMode === 'phpantom' &&
					params.lspStatus.state === 'ready' && (
						<Text fontSize="xs">PHP 8.5 analysis only</Text>
					)}
			</Flex>
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
	onChangeCode: (code: string) => void;
}) {
	// SandpackProvider resets its files whenever this object changes, which
	// discards edits still waiting for the debounce. Keep the first one.
	const [files] = React.useState(() => ({ '/app.php': params.initCode }));
	const [lspMode, setLspMode] = React.useState<LspMode>('off');
	const [lspStatus, setLspStatus] = React.useState<LspStatus>({
		state: 'off',
	});
	const onLspStatus = React.useCallback(
		(status: LspStatus) => setLspStatus(status),
		[]
	);

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
				lspMode={lspMode}
				lspStatus={lspStatus}
				onLspModeChange={setLspMode}
				Editor={
					<PhpEditor
						theme={params.theme}
						version={params.version}
						lspMode={lspMode}
						onLspStatus={onLspStatus}
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
