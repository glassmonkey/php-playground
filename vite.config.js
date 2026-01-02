import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

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
    assetsDir: '.'
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/workers',
      filename: 'service-worker.ts',
      injectManifest: {
        injectionPoint: undefined
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
})
