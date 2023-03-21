import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    open: true,
  },
  publicDir: 'assets',
  build: {
    outDir: 'public',
    assetsDir: '.'
  },
  plugins: [
    react(),
  ]
})
