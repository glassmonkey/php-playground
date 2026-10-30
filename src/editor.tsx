import type { Version } from './php-wasm/php';
import {
	SandpackLayout,
	SandpackProvider,
	useActiveCode,
	useSandpack,
} from '@codesandbox/sandpack-react';
import { usePHP } from './workers/client';
import { Box, Center, Flex, Spinner } from '@chakra-ui/react';
import type { ReactElement } from 'react';
import * as React from 'react';
import MonacoEditor, { type OnChange } from '@monaco-editor/react';
import { Format } from './format';
import debounce from 'debounce';
import { Preview } from './preview';
import type { PreviewTheme } from './preview-theme';
import type * as Monaco from 'monaco-editor';
import { LspClient } from './lsp/client';
import { createWorker } from './lsp/phpantom';

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
	autoComplete: boolean;
}) {
	const { code, updateCode } = useActiveCode();
	const { sandpack } = useSandpack();
	const [lspBinding, setLspBinding] = React.useState<{
		model: Monaco.editor.ITextModel;
		monaco: typeof Monaco;
	} | null>(null);

	const onChangeCode: OnChange = debounce((value) => {
		updateCode(value || '');
	}, 300);

	React.useEffect(() => {
		if (!params.autoComplete || !lspBinding) return;

		const worker = createWorker(params.version);
		let client: LspClient | undefined;
		let cancelled = false;

		void LspClient.connect({
			worker,
			model: lspBinding.model,
			monaco: lspBinding.monaco,
			phpVersion: params.version,
			onStatus: (status, message) => {
				if (status === 'error') {
					console.error('PHPantom completion failed:', message);
				}
			},
		})
			.then((connectedClient) => {
				if (cancelled) {
					connectedClient.dispose();
					return;
				}
				client = connectedClient;
			})
			.catch((error: unknown) => {
				if (!cancelled) {
					console.error('Could not start PHPantom completion:', error);
				}
			});

		return () => {
			cancelled = true;
			if (client) client.dispose();
			else worker.terminate();
		};
	}, [params.autoComplete, params.version, lspBinding]);

	return (
		<MonacoEditor
			width="100%"
			height="100%"
			language="php"
			theme={params.theme.mode === 'light' ? 'vs' : 'vs-dark'}
			key={sandpack.activeFile}
			defaultValue={code}
			onChange={onChangeCode}
			onMount={(editor, monaco) => {
				const model = editor.getModel();
				if (model) setLspBinding({ model, monaco });
			}}
			loading={<LoadSpinner />}
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
	const previousCode = React.useRef(code);
	React.useEffect(() => {
		if (previousCode.current === code) return;
		previousCode.current = code;
		params.onChangeCode(code);
	}, [code]);
	return <></>;
}

function EditorLayout(params: {
	Editor: ReactElement;
	Preview: ReactElement;
	theme: PreviewTheme;
}) {
	return (
		<Flex direction="column" padding="3" bg="gray.800" height="100%">
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
	autoComplete: boolean;
	theme: PreviewTheme;
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
						autoComplete={params.autoComplete}
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
