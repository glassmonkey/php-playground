import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import applicationConfig from '../vite.config.js';

export default mergeConfig(applicationConfig, {
  // Keep this server's optimizer generations separate from retained dev previews.
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-playwright', import.meta.url)),
  server: { open: false },
  optimizeDeps: {
    // The LSP worker is discovered after the initial page crawl. Optimizing its
    // dependency then would reload a page already using the previous React bundle.
    include: ['@bjorn3/browser_wasi_shim'],
  },
});
