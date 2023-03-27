import { Flex, HStack, Text } from '@chakra-ui/react';
import * as React from 'react';

export default function Footer() {
	return (
		<Flex direction="column" gap="8px">
			<HStack spacing="16px">
				<Text as="small" size="xs">
					<a href="privacy.html" target="_blank">
						Privacy Policy
					</a>
				</Text>
				<Text as="small" size="xs">
					<a href="https://twitter.com/glassmonekey" target="_blank">
						Contact
					</a>
				</Text>
			</HStack>
			<Text as="small" size="xs">
				&copy; 2023{' '}
				<a href="https://twitter.com/glassmonekey" target="_blank">
					@glassmonekey
				</a>
			</Text>
		</Flex>
	);
}
