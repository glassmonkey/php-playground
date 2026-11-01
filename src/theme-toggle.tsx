import * as React from 'react';
import { Flex, Switch, Text, useColorMode } from '@chakra-ui/react';

export default function ThemeToggle() {
	const { colorMode, toggleColorMode } = useColorMode();

	return (
		<Flex direction="row" gap="8px" alignItems="center">
			<Text as="span" fontSize="xs">
				UI Theme:
			</Text>
			<Switch
				variant="colormodeSwitcher"
				size="lg"
				fontSize="lg"
				aria-label="Light mode"
				isChecked={colorMode === 'light'}
				onChange={toggleColorMode}
				mr={2}
			/>
		</Flex>
	);
}
