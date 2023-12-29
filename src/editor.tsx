import type { Version } from './php-wasm/php';
import {
	SandpackLayout,
	SandpackProvider,
	useActiveCode,
	useSandpack,
} from '@codesandbox/sandpack-react';
import { usePHP } from './php';
import { Box, Center, Flex, Spinner, useColorMode } from '@chakra-ui/react';
import type { ReactElement } from 'react';
import * as React from 'react';
import MonacoEditor from '@monaco-editor/react';
import {Format} from "./format";

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
    const { colorMode } = useColorMode();

	return (
		<MonacoEditor
			width="100%"
			height="100%"
			language="php"
			theme={ ( colorMode === "light" ) ? "vs" : "vs-dark" }
			key={sandpack.activeFile}
			defaultValue={code}
			onChange={(value) => updateCode(value || '')}
			loading={<LoadSpinner />}
			options={{
				minimap: {
					enabled: false,
				},
			}}
		/>
	);
}

function PhpPreview(params: { version: Version, format: Format }) {
	const { sandpack } = useSandpack();
	const { files, activeFile } = sandpack;
	const code = files[activeFile].code;
	const [loading, result] = usePHP(params.version, code);

	if (loading) {
		return <LoadSpinner />;
	}
	if (params.format === "console") {
		return <pre style={{whiteSpace: "pre-wrap", overflow: "scroll", width: "100%", height: "100%"}}>{result}</pre>;
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
	format: Format;
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
				Preview={<PhpPreview version={params.version} format={params.format} />}
			/>
			<PhpCodeCallback onChangeCode={params.onChangeCode} />
		</SandpackProvider>
	);
}
