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
import { Version, versions } from "./php-wasm/php";

function asVersion(s: string | null): Version | null {
	const r = versions.filter((v) => v == s).pop();
	if (!r) {
		return null;
	}
	return r;
}

const options = versions.map((v) => ({
	value: v,
	label: v,
}));

type Option = (typeof options)[number];

async function initPHP(v: Version) {
	// todo handling when load failed
	const PHPLoaderModule = await import(`./php-${v}.js`);
	return startPHP(v, PHPLoaderModule, 'WEB', {});
}

async function runPHP(php: PHP, code: string) {
	const output = php.run({
		code: code,
	});
	return new TextDecoder().decode(output.body);
}

function usePHP(
	version: Version,
	code: string
): [boolean, string] {
	const [php, setPHP] = useState<PHP|null>(null)
	const [loading, setLoading] = useState<boolean>(false);
	const [internalCode, setInternalCode] = useState<string>('');
	const [result, setResult] = useState<string>('');

	useEffect(
		function () {
			if(php?.version != version) {
				setLoading(true);
				queueMicrotask(
					async function(){
						setPHP(await initPHP(version));
					}
				);
				return;
			}

			if (internalCode != code) {
				setLoading(true);
				setInternalCode(code);
				return;
			}
			if (!loading) {
				return;
			}

			if (internalCode == "") {
				setResult("empty data");
				setLoading(false);
				return;
			}

			setTimeout(
				async function() {
					const info = await runPHP(php, internalCode);
					setResult(info);
					setLoading(false);
				}, 15
			);

		},
		[php, code, internalCode, loading, version]
	);

	return [loading, result];
}

function PhpPreview(params: {
	version: Version
}) {
	const { sandpack } = useSandpack();
	const { files, activeFile } = sandpack;
	const code = files[activeFile].code;
	const [loading, result] = usePHP(params.version, code);

	if (loading) {
		return <Spinner />;
	}

	return <iframe srcDoc={result} height="100%" width="100%" sandbox="" />;
}

function PhpCodeCallback(params: {onChangeCode: (code: string) => void}) {
	const { sandpack } = useSandpack();
	const { files, activeFile } = sandpack;
	const code = files[activeFile].code;
	params.onChangeCode(code);
	return <></>
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
	initCode: string
	version: Version
	onChangeCode: (code: string) => void
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
						version={params.version}
					/>
				}
			/>
			<PhpCodeCallback onChangeCode={params.onChangeCode}/>
		</SandpackProvider>
	);
}

export default function () {
	const [searchParams, setSearchParams] = useSearchParams();
	const defaultOption = options[options.length - 1];

	const c = lzstring.decompressFromEncodedURIComponent(
		searchParams.get('c') ?? ''
	);
	const [initCode] = useState<string>(
		c != null ? c : '<?php\n// example code\nphpinfo();'
	);
	const version = asVersion(searchParams.get('v')) ?? defaultOption.value;
	const versionIndex = versions.findIndex((v) => v == version);
	const versionOption = options[versionIndex];

	function updateVersion(o: Option) {
		setSearchParams(
			{
				v: o.value,
			}
		)
	}

	function setHistory(code: string, version: Version) {
		const state = {
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
			updateVersion(versionOption);
		},
		[initCode, versionOption]
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
						defaultValue={versionOption}
						onChange={(option) => {
							if (option !== versionOption) {
								updateVersion(option ?? versionOption)
							}
						}}
					/>
				</Flex>
			</Flex>
			<Editor
				initCode={initCode}
				version={version}
				onChangeCode={function (code: string) {
					setHistory(code, version);
				}}
			/>
		</main>
	);
}
