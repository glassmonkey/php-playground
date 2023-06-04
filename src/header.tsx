import { Heading, Link, Text, Flex } from '@chakra-ui/react';
import * as React from 'react';

export default function Header() {
	return (
		<Flex gap="8px" direction="column">
			<Heading as="h1">PHP Playground</Heading>
			<Text as="p">
				PHP Playground let you to execute basic PHP code in real time
				using WebAssembly technology.
			</Text>
			<Text as="p">
				<Link href="#about">About PHP Playground?</Link>
			</Text>
		</Flex>
	);
}
