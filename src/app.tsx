import * as React from 'react';
import { ReactElement, useEffect } from 'react';
import { Spinner, Flex, Box, Spacer, Text } from '@chakra-ui/react';
import { php as lnagPhp } from '@codemirror/lang-php';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { useSandpack } from '@codesandbox/sandpack-react';
import { useSearchParams } from 'react-router-dom';
import * as lzstring from 'lz-string';

import {
	SandpackProvider,
	SandpackLayout,
	SandpackCodeEditor,
} from '@codesandbox/sandpack-react';
import { Version, versions, asVersion } from './php-wasm/php';
import { usePHP } from './php';
import SelectPHP from './select';

function PhpPreview(params: { version: Version }) {
	const { sandpack } = useSandpack();
	const { files, activeFile } = sandpack;
	const code = files[activeFile].code;
	const [loading, result] = usePHP(params.version, code);

	if (loading) {
		return <Spinner />;
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

function Editor(params: {
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
				Editor={
					<SandpackCodeEditor
						showRunButton={false}
						showLineNumbers
						showTabs={false}
						style={{ height: '100%' }}
						extensions={[autocompletion()]}
						extensionsKeymap={[completionKeymap]}
						additionalLanguages={[
							{
								name: 'php',
								extensions: ['php'],
								language: lnagPhp(),
							},
						]}
					/>
				}
				Preview={<PhpPreview version={params.version} />}
			/>
			<PhpCodeCallback onChangeCode={params.onChangeCode} />
		</SandpackProvider>
	);
}

type UrlState = {
	v: Version;
	c: string;
};

export default function App() {
	const [searchParams, setSearchParams] = useSearchParams();
	const initCode =
		lzstring.decompressFromEncodedURIComponent(
			searchParams.get('c') ?? ''
		) ?? '<?php\n// example code\nphpinfo();';

	const currentVersion =
		asVersion(searchParams.get('v')) ?? versions[versions.length - 1];

	function updateVersion(v: Version) {
		const currentState = history.state as UrlState | null;
		const code = lzstring.decompressFromEncodedURIComponent(
			currentState?.c ?? initCode
		);
		setSearchParams({
			v: v,
			c: lzstring.compressToEncodedURIComponent(code),
		});
		setHistory(code, v);
	}

	function setHistory(code: string, version: Version) {
		const state: UrlState = {
			c: lzstring.compressToEncodedURIComponent(code),
			v: version,
		};
		const urlSearchParam = new URLSearchParams(state).toString();
		// Only push to history.
		// I don't want to have it re-render with a URL change when the code changes.
		history.pushState(state, '', `?${urlSearchParam}`);
	}

	useEffect(
		function () {
			updateVersion(currentVersion);
		},
		[currentVersion]
	);

	return (
		<main style={{ margin: '16px' }}>
			<Flex marginTop="8px" marginBottom="8px" gap="16px">
				<Box marginTop="auto" marginBottom="auto">
					<a
						href="https://github.com/glassmonkey/php-playground/issues"
						target="_blank"
					>
						<Flex>
							<img
								src="octocat.png"
								width="40px"
								height="40px"
								style={{
									marginTop: 'auto',
									marginBottom: 'auto',
								}}
							/>
							<Text
								fontSize="sm"
								style={{
									marginTop: 'auto',
									marginBottom: 'auto',
								}}
							>
								&lt; Request and Report
							</Text>
						</Flex>
					</a>
				</Box>
				<Spacer />
				<Flex direction={{ base: 'column', lg: 'row' }} gap="8px">
					<label
						style={{
							marginTop: 'auto',
							marginBottom: 'auto',
						}}
					>
						<Text fontSize="xs">Version:</Text>
					</label>
					<SelectPHP
						onChange={updateVersion}
						version={currentVersion}
					/>
				</Flex>
			</Flex>
			<Editor
				initCode={initCode}
				version={currentVersion}
				onChangeCode={function (code: string) {
					setHistory(code, currentVersion);
				}}
			/>
		</main>
	);
}
