import { Heading, Text, Flex, Center, Link } from '@chakra-ui/react';
import * as React from 'react';
import { Link as RouterLink } from 'react-router-dom';

export default function Header() {
	return (
		<Flex gap="8px" direction="column">
			<Heading as="h1">PHP Playground</Heading>
			<Text as="p">
				Run PHP code in your browser using WebAssembly. New to PHP?{' '}
				<Link as={RouterLink} to="/tutorial/" textDecoration="underline">
					Learn the basics with interactive examples
				</Link>
				.
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
