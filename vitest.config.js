import { defineConfig, mergeConfig } from "vite";
import react from '@vitejs/plugin-react'
import ViteConfig from "./vite.config";
import {configDefaults} from "vitest/config";

// https://vitejs.dev/config/
export default mergeConfig(ViteConfig, {
  test: {
    environmentMatchGlobs: [
      ['src/__test__/**.spec.ts', 'jsdom'],
      ['src/__test__/**.test.ts', 'node'],
    ],
    exclude: [...configDefaults.exclude, 'e2e/**',],
    setupFiles: ['@vitest/web-worker'],
  },
})
