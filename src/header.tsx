import {Heading, Text, Flex, Center} from '@chakra-ui/react';
import * as React from 'react';

export default function Header() {
	return (
		<Flex gap="8px" direction="column">
			<Heading as="h1">PHP Playground</Heading>
			<Text as="p">
				PHP Playground let you to execute basic PHP code in real time
				using WebAssembly technology.
			</Text>
			<Flex gap="24px" direction="row">
				<Center>
					<Text fontStyle="italic" href="#about" as="a">About PHP Playground?</Text>
				</Center>
			</Flex>
		</Flex>
	);
}
