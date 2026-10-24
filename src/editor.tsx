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

function LoadSpinner() {
	return (
		<Center height="100%" width="100%" data-testid="loading-spinner">
			<Spinner size="xl" />
		</Center>
	);
}

function PhpEditor(params: { theme: PreviewTheme }) {
	const { code, updateCode } = useActiveCode();
	const { sandpack } = useSandpack();

	const onChangeCode: OnChange = debounce((value) => {
		updateCode(value || '');
	}, 300);

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
				Editor={<PhpEditor theme={params.theme} />}
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
