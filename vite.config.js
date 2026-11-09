import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import brand from './branding/vite-plugin.mjs'
import singleFile from './branding/single-file.mjs'

const single = Boolean(process.env.GUIDE_SINGLE)

export default defineConfig({
  plugins: [react(), brand(), ...(single ? [singleFile()] : [])],
  base: process.env.GUIDE_BASE || '/dbt_interactive_guide/',
  build: single
    ? {
        assetsInlineLimit: 100_000_000,   // every image, font and icon as a data URI
        cssCodeSplit: false,
        modulePreload: { polyfill: false },
        rollupOptions: { output: { inlineDynamicImports: true } },
        chunkSizeWarningLimit: 8000,
      }
    : {},
})
