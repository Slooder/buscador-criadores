/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
  test: { root: '.', globals: true, include: ['tests/**/*.test.ts'] },
})
