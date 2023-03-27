import { Box, Heading, Text } from '@chakra-ui/react';
import * as React from 'react';

export default function Header() {
	return (
		<>
			<Heading as="h1" marginBottom="8px">
				PHP Playground
			</Heading>
			<Text as="p">
				PHP Playground let you to execute basic PHP code in real time.
			</Text>
		</>
	);
}
