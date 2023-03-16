import * as React from 'react';
import { PHP, startPHP } from './php-wasm';
import { ReactElement, useEffect, useState } from 'react';
import Select from 'react-select';
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

const versions = [
	'5.6',
	'7.0',
	'7.1',
	'7.2',
	'7.3',
	'7.4',
	'8.0',
	'8.1',
	'8.2',
] as const;

function asVersion(s: string | null): Version | null {
	const r = versions.filter((v) => v == s).pop();
	if (!r) {
		return null;
	}
	return r;
}

type Version = (typeof versions)[number];

const options = versions.map((v) => ({
	value: v,
	label: v,
}));

type Option = (typeof options)[number];

async function initPHP(v: Version) {
	// todo handling when load failed
	const PHPLoaderModule = await import(`./php-${v}.js`);
	return startPHP(PHPLoaderModule, 'WEB', {});
}

async function runPHP(php: PHP, code: string) {
	const output = php.run({
		code: code,
	});
	return new TextDecoder().decode(output.body);
}

function PhpPreview(params: {
	php: PHP | null;
	onChangeCode: (code: string) => void;
}) {
	const { sandpack } = useSandpack();

	const { files, activeFile } = sandpack;
	const code = files[activeFile].code;
	const [result, setResult] = useState('');

	useEffect(
		function () {
			(async function () {
				if (params.php == null) {
					return;
				}
				const info = await runPHP(params.php, code);
				setResult(info);
				params.onChangeCode(code);
			})();
		},
		[params.php, code]
	);
	if (params.php == null) {
		return <Spinner />;
	}

	return <iframe srcDoc={result} height="100%" width="100%" sandbox="" />;
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
	php: PHP | null;
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
				Preview={
					<PhpPreview
						php={params.php}
						onChangeCode={params.onChangeCode}
					/>
				}
			/>
		</SandpackProvider>
	);
}

export default function () {
	const [searchParams, setSearchParams] = useSearchParams();
	const defaultOption = options[options.length - 1];

	const c = lzstring.decompressFromEncodedURIComponent(
		searchParams.get('c') ?? ''
	);
	const [initCode, setCode] = useState<string>(
		c != null ? c : '<?php\n// example code\nphpinfo();'
	);
	const [php, setPHP] = useState<PHP | null>(null);
	const [selectedVersion, selectVersion] = useState<Option>(defaultOption);
	const version = asVersion(searchParams.get('v')) ?? selectedVersion.value;

	function updateVersion(o: Option) {
		// null means loading.
		setPHP(null);
		selectVersion(o);
		setSearchParams({
			c: lzstring.compressToEncodedURIComponent(initCode),
			v: o.value,
		});
	}

	useEffect(
		function () {
			const versionIndex = versions.findIndex((v) => v == version);
			updateVersion(options[versionIndex]);

			(async function () {
				setPHP(await initPHP(version));
			})();
		},
		[selectedVersion, version]
	);

	return (
		<main style={{ margin: '16px' }}>
			<Flex marginTop="8px" marginBottom="8px" gap="16px">
				<Box marginLeft="16px" marginTop="auto" marginBottom="auto">
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
								&lt; Feature Request and Bug Report
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
					<Select
						styles={{
							option: (baseStyles, state) => ({
								...baseStyles,
								color: 'black',
								fontSize: '14px',
							}),
							control: (baseStyles, state) => ({
								...baseStyles,
								color: 'black',
								fontSize: '14px',
							}),
						}}
						options={options}
						defaultValue={selectedVersion}
						onChange={(option) => {
							updateVersion(option ?? defaultOption);
						}}
					/>
				</Flex>
			</Flex>
			<Editor
				initCode={initCode}
				php={php}
				onChangeCode={function (code: string) {
					setCode(code);
					setSearchParams({
						c: lzstring.compressToEncodedURIComponent(code),
						v: version,
					});
				}}
			/>
		</main>
	);
}
