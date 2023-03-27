import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { ChakraProvider, Center, Box } from '@chakra-ui/react';
import App from './app';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Header from './header';
import Footer from './footer';

const router = createBrowserRouter([
	{
		path: '*',
		element: <App />,
	},
]);

const root = ReactDOM.createRoot(document.getElementById('app')!);
root.render(
	<ChakraProvider>
		<Box style={{ margin: '16px' }}>
			<Header />
		</Box>
		<RouterProvider router={router} />
		<Center>
			<Footer />
		</Center>
	</ChakraProvider>
);
