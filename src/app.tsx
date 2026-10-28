import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
	Flex,
	Box,
	Spacer,
	Text,
	Link,
	Center,
	Button,
	Switch,
	Checkbox,
	useColorMode,
} from '@chakra-ui/react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import * as lzstring from 'lz-string';

import { Version, asVersion, defaultVersion } from './php-wasm/php';
import SelectPHP from './select';
import { Editor } from './editor';
import { BellIcon } from '@chakra-ui/icons';
import { Format, SelectFormat } from './format';
import { previewThemeFor } from './preview-theme';
import { isAutoCompleteEnabled, withAutoComplete, withSearchParam } from './url-state';

export default function App() {
	const location = useLocation();
	const navigate = useNavigate();
	const navigationType = useNavigationType();
	const searchParams = new URLSearchParams(location.search);
	const initCode =
		lzstring.decompressFromEncodedURIComponent(
			searchParams.get('c') ?? ''
		) ?? '<?php\n// example code\nphpinfo();';

	const currentVersion = asVersion(searchParams.get('v')) ?? defaultVersion;

	const { colorMode, toggleColorMode } = useColorMode();
	const previewTheme = previewThemeFor(colorMode);

	const currentFormat: Format =
		searchParams.get('f') === 'console' ? 'console' : 'html';
	const autoComplete = isAutoCompleteEnabled(searchParams);
	const [editorHistoryKey, setEditorHistoryKey] = useState(0);
	const previousLocationKey = useRef(location.key);
	const initializedUrl = useRef(false);

	useEffect(() => {
		if (
			previousLocationKey.current !== location.key &&
			navigationType === 'POP'
		) {
			setEditorHistoryKey((key) => key + 1);
		}
		previousLocationKey.current = location.key;
	}, [location.key, navigationType]);

	useEffect(() => {
		if (initializedUrl.current) return;
		initializedUrl.current = true;
		let next = new URLSearchParams(window.location.search);
		next = withSearchParam(
			next,
			'c',
			lzstring.compressToEncodedURIComponent(initCode)
		);
		next = withSearchParam(next, 'v', currentVersion);
		next = withSearchParam(next, 'f', currentFormat);
		navigate(
			{ search: `?${next.toString()}` },
			{ replace: true, state: location.state }
		);
	}, []);

	function updateVersion(v: Version) {
		updateSearchParam('v', v);
	}

	function updateSearchParam(key: string, value: string) {
		const next = withSearchParam(
			new URLSearchParams(window.location.search),
			key,
			value
		);
		navigate({ search: `?${next.toString()}` }, { state: location.state });
	}

	function updateFormat(format: Format) {
		updateSearchParam('f', format);
	}

	function updateAutoComplete(enabled: boolean) {
		const next = withAutoComplete(
			new URLSearchParams(window.location.search),
			enabled
		);
		navigate({ search: `?${next.toString()}` }, { state: location.state });
	}

	function updateCode(code: string) {
		updateSearchParam(
			'c',
			lzstring.compressToEncodedURIComponent(code)
		);
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
							leftIcon={<BellIcon />}
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
						key={currentVersion}
						onChange={updateVersion}
						version={currentVersion}
					/>
					<Flex direction="row" gap={'8px'} alignItems={'center'}>
						<Text fontSize="xs">UI Theme:</Text>
						<Switch
							variant="colormodeSwitcher"
							size="lg"
							fontSize="lg"
							isChecked={colorMode === 'light'}
							onChange={toggleColorMode}
							mr={2}
						/>
					</Flex>
					<SelectFormat
						format={currentFormat}
						updateFormat={updateFormat}
					/>
					<Checkbox
						data-testid="checkbox-auto-complete"
						isChecked={autoComplete}
						onChange={(event) => updateAutoComplete(event.target.checked)}
					>
						Auto complete
					</Checkbox>
				</Flex>
			</Flex>
			<Editor
				key={editorHistoryKey}
				initCode={initCode}
				version={currentVersion}
				format={currentFormat}
				autoComplete={autoComplete}
				theme={previewTheme}
				onChangeCode={updateCode}
			/>
		</main>
	);
}
