import { Box, Heading, Highlight, Link, Text, Flex } from '@chakra-ui/react';
import React from 'react';

export default function Manual() {
	return (
		<Flex gap="16px" direction="column">
			<Heading as="h2" id="about">
				About PHP Playground
			</Heading>
			<Flex as="section" direction="column" gap="8px">
				<Heading as="h3">Description</Heading>
				<Box>
					<Text as="p">
						The Playground let you to execute basic{' '}
						<Link href="https://www.php.net/" isExternal>
							PHP
						</Link>{' '}
						code in real time using WebAssembly technology.
					</Text>
					<Text as="p">
						The code you write can be immediately shared with your
						friends via URL.
					</Text>
				</Box>
			</Flex>

			<Flex as="section" direction="column" gap="8px">
				<Heading as="h3">Usage</Heading>
				<Box>
					<Text as="p">
						Simply enter the PHP code into the form. The result of
						the execution output will be displayed in Iframe as
						HTML.
					</Text>
					<Text as="p">
						Additionally, by selecting a different PHP version from
						the select box, you can switch between versions without
						having to change the currently running PHP execution
						code. This allows you to experience the differences in
						PHP execution between different versions.
					</Text>
					<Text as="p">
						The URL parameter is saved with the status when the code
						is entered, and can be bookmarked or referred to a
						friend if necessary. Please use it to share snippets of
						your code review.
					</Text>
				</Box>
			</Flex>
			<Flex as="section" direction="column" gap="8px">
				<Heading as="h3">Notes</Heading>
				<Box>
					<Text as="p">
						<Highlight
							query="while(true)"
							styles={{ px: '1', py: '1', bg: 'gray.100', fontFamily: 'mono', borderRadius: 'sm' }}
						>
							If you write code that hangs (e.g., an infinite loop like while(true)), you can stop the execution by modifying the code. The PHP code is executed in a Web Worker, so editing the code will terminate the previous execution.
						</Highlight>
					</Text>
				</Box>
			</Flex>
			<Flex as="section" direction="column" gap="8px">
				<Heading as="h3">Security</Heading>
				<Box>
					<Text as="p">
						PHP code is very secure because it is executed only
						within the browser using WebAssembly technology.
					</Text>
					<Text as="p">
						In addition, the results of the execution are output to
						an iframe using an empty{' '}
						<Link
							href="https://developer.mozilla.org/ja/docs/Web/HTML/Element/iframe#attr-sandbox"
							isExternal
						>
							sandbox attribute
						</Link>
						, so no JavaScript or other code will run.{' '}
					</Text>
				</Box>
			</Flex>

			<Flex as="section" direction="column" gap="8px">
				<Heading as="h3">Request & Report</Heading>
				<Box>
					<Text as="p">
						If you have any problems or feature requests, please
						contact{' '}
						<Link
							href="https://github.com/glassmonkey/php-playground/issues"
							isExternal
						>
							Issue
						</Link>{' '}
						or{' '}
						<Link
							href="https://twitter.com/glassmonekey"
							isExternal
						>
							DM
						</Link>
						.
					</Text>
				</Box>
			</Flex>
		</Flex>
	);
}
