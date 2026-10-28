import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { ChakraProvider, Center, Box, ColorModeScript } from '@chakra-ui/react';
import App from './app';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Header from './header';
import Footer from './footer';
import Manual from './manual';
import theme from './theme';
import TutorialPage from './tutorial/page';

function PlaygroundPage() {
	return (
		<>
			<Box style={{ margin: '16px' }}>
				<Header />
				<a href="/tutorial/">Learn PHP →</a>
			</Box>
			<App />
			<Box style={{ margin: '16px' }}>
				<Manual />
			</Box>
			<Center>
				<Footer />
			</Center>
		</>
	);
}

const router = createBrowserRouter([
	{ path: '/tutorial', element: <TutorialPage /> },
	{ path: '/tutorial/:version', element: <TutorialPage /> },
	{ path: '/tutorial/:version/:slug', element: <TutorialPage /> },
	{ path: '/tutorial/*', element: <TutorialPage /> },
	{
		path: '*',
		element: <PlaygroundPage />,
	},
]);

const root = ReactDOM.createRoot(document.getElementById('app')!);
root.render(
	<>
		<ColorModeScript initialColorMode={theme.config.initialColorMode} />
		<ChakraProvider theme={theme}>
			<RouterProvider router={router} />
		</ChakraProvider>
	</>
);
