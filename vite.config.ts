import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// base matches the GitHub Pages project path: https://pegaslee.github.io/learn-slo/
export default defineConfig({
  plugins: [react()],
  base: '/learn-slo/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
