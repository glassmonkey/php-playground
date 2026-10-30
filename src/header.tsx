import { Heading, Text, Flex, Center, Link } from '@chakra-ui/react';
import * as React from 'react';
import { Link as RouterLink } from 'react-router-dom';

export default function Header() {
	return (
		<Flex gap="8px" direction="column">
			<Heading as="h1">PHP Playground</Heading>
			<Text as="p">Run PHP code in your browser using WebAssembly.</Text>
			<Flex gap="24px" direction="row" wrap="wrap">
				<Center>
					<Text fontStyle="italic" href="#about" as="a">
						About PHP Playground?
					</Text>
				</Center>
				<Center>
					<Link as={RouterLink} to="/tutorial/" fontStyle="italic">
						Want to learn PHP?
					</Link>
				</Center>
			</Flex>
		</Flex>
	);
}
