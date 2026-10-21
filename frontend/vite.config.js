import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    // Half the cores: each worker is a jsdom process, and 16 of them on a memory-tight machine failed to start in time (not a test-timing fix).
    maxWorkers: '50%',
  },
})
