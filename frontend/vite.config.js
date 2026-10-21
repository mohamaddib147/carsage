import react from '@vitejs/plugin-react'
import { configDefaults } from 'vitest/config'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    // Half the cores: each worker is a jsdom process, and 16 of them on a memory-tight machine failed to start in time (not a test-timing fix).
    maxWorkers: '50%',
    // A local `npm run build` copies public/ (including a test file) into dist/; never run that copy.
    exclude: [...configDefaults.exclude, '**/dist/**'],
  },
})
