import type { Version } from './php-wasm/php';
import {
	SandpackLayout,
	SandpackProvider,
	useActiveCode,
	useSandpack,
} from '@codesandbox/sandpack-react';
import { usePHP } from './php';
import { Box, Center, Flex, Spinner } from '@chakra-ui/react';
import type { ReactElement } from 'react';
import * as React from 'react';
import MonacoEditor, { useMonaco } from '@monaco-editor/react';

function LoadSpinner() {
	return (
		<Center height="100%">
			<Spinner size="xl" />
		</Center>
	);
}

function PhpEditor() {
	const { code, updateCode } = useActiveCode();
	const { sandpack } = useSandpack();
	return (
		<MonacoEditor
			width="100%"
			height="100%"
			language="php"
			theme="light"
			key={sandpack.activeFile}
			defaultValue={code}
			onChange={(value) => updateCode(value || "")}
			loading={<LoadSpinner />}
			options={{
				minimap: {
					enabled: false
				}
			}}
		/>);
}

function PhpPreview(params: { version: Version }) {
	const { sandpack } = useSandpack();
	const { files, activeFile } = sandpack;
	const code = files[activeFile].code;
	const [loading, result] = usePHP(params.version, code);

	if (loading) {
		return <LoadSpinner />;
	}

	return <iframe srcDoc={result} height="100%" width="100%" sandbox="" />;
}

function PhpCodeCallback(params: { onChangeCode: (code: string) => void }) {
	const { sandpack } = useSandpack();
	const { files, activeFile } = sandpack;
	const code = files[activeFile].code;
	params.onChangeCode(code);
	return <></>;
}

function EditorLayout(params: { Editor: ReactElement; Preview: ReactElement }) {
	return (
		<Flex direction="column" padding="3" bg="gray.800" height="100%">
			<Flex
				justify="space-between"
				direction={{ base: 'column', lg: 'row' }}
				align="center"
				gap="8px"
				height="75vh"
			>
				<Box
					as={SandpackLayout}
					flexDirection={{ base: 'column', lg: 'row' }}
					height={{ base: '50%', lg: '100%' }}
					width="100%"
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
					width="100%"
					height={{ base: '50%', lg: '100%' }}
					style={{
						backgroundColor: 'white',
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
	onChangeCode: (code: string) => void;
}) {
	return (
		<SandpackProvider
			template="react"
			files={{ '/app.php': params.initCode }}
			options={{
				activeFile: '/app.php', // used to be activePath
				visibleFiles: ['/app.php'], // used to be openPaths
			}}
		>
			<EditorLayout
				Editor={<PhpEditor />}
				Preview={<PhpPreview version={params.version} />}
			/>
			<PhpCodeCallback onChangeCode={params.onChangeCode} />
		</SandpackProvider>
	);
}
