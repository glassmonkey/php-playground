import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tutorialSeoBuildPlugin } from './src/tutorial/seo-build.ts';

// https://vitejs.dev/config/
export default defineConfig({
	server: {
		open: true,
		host: '127.0.0.1',
		port: 18888,
	},
	publicDir: 'assets',
	build: {
		outDir: 'public',
		assetsDir: '.',
	},
	plugins: [react(), tutorialSeoBuildPlugin()],
});
