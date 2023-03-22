import { defineConfig, mergeConfig } from "vite";
import react from '@vitejs/plugin-react'
import ViteConfig from "./vite.config";

// https://vitejs.dev/config/
export default mergeConfig(ViteConfig, {
  test: {
    environmentMatchGlobs: [
      ['src/__test__/**.spec.ts', 'jsdom'],
      ['src/__test__/**.test.ts', 'node'],
    ]
  }
})
