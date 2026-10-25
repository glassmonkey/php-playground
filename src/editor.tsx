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
	Switch,
	Text,
	Tooltip,
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

	const onChangeCode: OnChange = debounce((value) => {
		updateCode(value || '');
	}, 300);
	const onMount: OnMount = (editor, monaco) => {
		setEditorInstance(editor);
		setMonacoInstance(monaco);
	};

	React.useEffect(() => {
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
	lspEnabled: boolean;
	lspStatus: LspStatus;
	onLspEnabledChange: (enabled: boolean) => void;
}) {
	const surface = useColorModeValue('gray.50', 'gray.800');
	const foreground = useColorModeValue('gray.800', 'gray.100');
	const completionStateColor = useColorModeValue('gray.600', 'gray.300');
	const completionErrorColor = useColorModeValue('orange.600', 'orange.300');
	const trackHoverFilter = useColorModeValue(
		'brightness(0.95)',
		'brightness(1.2)'
	);
	const unsupportedPhpVersion =
		params.lspStatus.state === 'error' &&
		params.lspStatus.message?.startsWith(
			'PHPantom 0.11.1 WASI does not apply'
		);
	const completionError =
		params.lspStatus.state !== 'error'
			? undefined
			: unsupportedPhpVersion
				? 'PHP 8.4は未対応です。PHPantomはPHP 8.5固定です。'
				: (params.lspStatus.message ??
					'PHP補完を開始できませんでした。');
	const completionStatusId = 'php-completion-status';

	return (
		<Flex
			direction="column"
			padding="3"
			bg={surface}
			color={foreground}
			height="100%"
		>
			<Flex align="center" gap="2" paddingBottom="3" flexWrap="wrap">
				<Text
					as="label"
					htmlFor="php-completion-toggle"
					fontSize="sm"
					cursor="pointer"
				>
					補完
				</Text>
				<Switch
					id="php-completion-toggle"
					aria-label="PHP補完"
					aria-describedby={
						completionError ? completionStatusId : undefined
					}
					colorScheme="gray"
					size="md"
					isChecked={params.lspEnabled}
					cursor="pointer"
					sx={{
						'&:hover .chakra-switch__track': {
							filter: trackHoverFilter,
						},
						'.chakra-switch__input:focus-visible + .chakra-switch__track':
							{
								boxShadow:
									'0 0 0 3px var(--chakra-colors-gray-500)',
							},
					}}
					onChange={(event) =>
						params.onLspEnabledChange(event.target.checked)
					}
				/>
				<Text
					fontSize="xs"
					fontWeight="semibold"
					color={completionStateColor}
				>
					{params.lspEnabled ? 'ON' : 'OFF'}
				</Text>
				{completionError && (
					<Tooltip label={completionError} placement="top">
						<Text
							id={completionStatusId}
							as="span"
							role="status"
							aria-live="polite"
							aria-label={completionError}
							color={completionErrorColor}
							fontSize="sm"
							fontWeight="bold"
							cursor="help"
						>
							!
						</Text>
					</Tooltip>
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
	const [lspEnabled, setLspEnabled] = React.useState(false);
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
				lspEnabled={lspEnabled}
				lspStatus={lspStatus}
				onLspEnabledChange={setLspEnabled}
				Editor={
					<PhpEditor
						theme={params.theme}
						version={params.version}
						lspEnabled={lspEnabled}
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
