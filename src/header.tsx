import { Heading, Text, Flex, Center, Button } from '@chakra-ui/react';
import * as React from 'react';
import { Link } from 'react-router-dom';

export default function Header() {
	return (
		<Flex gap="8px" direction="column">
			<Flex justify="space-between" align="center" gap={4} wrap="wrap">
				<Heading as="h1">PHP Playground</Heading>
				<Button as={Link} to="/tutorial/" colorScheme="green">
					Tutorial →
				</Button>
			</Flex>
			<Text as="p">
				PHP Playground let you to execute basic PHP code in real time
				using WebAssembly technology.
			</Text>
			<Flex gap="24px" direction="row">
				<Center>
					<Text fontStyle="italic" href="#about" as="a">
						About PHP Playground?
					</Text>
				</Center>
			</Flex>
		</Flex>
	);
}
