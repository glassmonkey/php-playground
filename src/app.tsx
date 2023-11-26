import * as React from 'react';
import { useEffect } from 'react';
import {
	Flex,
	Box,
	Spacer,
	Text,
	Link,
	Center,
	Button,
} from '@chakra-ui/react';
import { useSearchParams } from 'react-router-dom';
import * as lzstring from 'lz-string';

import { Version, asVersion } from './php-wasm/php';
import SelectPHP from './select';
import { Editor } from './editor';
import { SunIcon } from '@chakra-ui/icons';
import {Format, SelectFormat} from "./format";

type UrlState = {
	v: Version;
	c: string;
	f: Format;
};

export default function App() {
	const [searchParams, setSearchParams] = useSearchParams();
	const initCode =
		lzstring.decompressFromEncodedURIComponent(
			searchParams.get('c') ?? ''
		) ?? '<?php\n// example code\nphpinfo();';

	const currentVersion =
		asVersion(searchParams.get('v')) ?? '8.3';

	const currentFormat = searchParams.get('f') as Format ?? "html";

	function updateVersion(v: Version) {
		const currentState = history.state as UrlState | null;
		const code = lzstring.decompressFromEncodedURIComponent(
			currentState?.c ?? initCode
		);
		const format = currentState?.f ?? currentFormat;
		if (code == null) {
			return;
		}
		setSearchParams({
			v: v,
			c: lzstring.compressToEncodedURIComponent(code),
			f: format,
		});
		setHistory(code, v, format);
	}

	function setHistory(code: string, version: Version, format: Format) {
		const state: UrlState = {
			c: lzstring.compressToEncodedURIComponent(code),
			v: version,
			f: format,
		};
		const urlSearchParam = new URLSearchParams(state).toString();
		// Only push to history.
		// I don't want to have it re-render with a URL change when the code changes.
		history.pushState(state, '', `?${urlSearchParam}`);
	}

	useEffect(
		function () {
			updateVersion(currentVersion);
			updateFormat(currentFormat)
		},
		[currentVersion, currentFormat]
	);

	function updateFormat(format: Format) {
		const currentState = history.state as UrlState | null;
		const code = lzstring.decompressFromEncodedURIComponent(
			currentState?.c ?? initCode
		);
		const version = currentState?.v ?? currentVersion;
		if (code == null) {
			return;
		}
		setSearchParams({
			v: version,
			c: lzstring.compressToEncodedURIComponent(code),
			f: format,
		});
		setHistory(code, version, format);
	}

	return (
		<main style={{ margin: '16px' }}>
			<Flex marginTop="8px" marginBottom="8px" gap="16px">
				<Box marginTop="auto" marginBottom="auto">
					<Link
						href="https://github.com/glassmonkey/php-playground/issues"
						isExternal
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
					</Link>
				</Box>
				<Spacer />
				<Flex direction={{ base: 'column', lg: 'row' }} gap="16px">
					<Center>
						<Button
							leftIcon={<SunIcon />}
							href="https://github.com/sponsors/glassmonkey"
							as="a"
							colorScheme="green"
						>
							Donate
						</Button>
					</Center>
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
					<SelectFormat format={currentFormat} updateFormat={updateFormat}/>
				</Flex>
			</Flex>
			<Editor
				initCode={initCode}
				version={currentVersion}
				format={currentFormat}
				onChangeCode={function (code: string) {
					setHistory(code, currentVersion, currentFormat);
				}}
			/>
		</main>
	);
}
