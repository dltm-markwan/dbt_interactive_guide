import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import brand from './branding/vite-plugin.mjs'

export default defineConfig({
  plugins: [react(), brand()],
  base: process.env.GUIDE_BASE || '/dbt_interactive_guide/',
})
