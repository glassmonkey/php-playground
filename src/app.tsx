import * as React from 'react';
import { useEffect } from 'react';
import { Flex, Box, Spacer, Text, Link } from '@chakra-ui/react';
import { useSearchParams } from 'react-router-dom';
import * as lzstring from 'lz-string';

import { Version, versions, asVersion } from './php-wasm/php';
import SelectPHP from './select';
import { Editor } from './editor';

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
