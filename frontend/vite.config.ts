import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const API = process.env.VITE_API_PROXY ?? 'http://localhost:8085'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5185,
    strictPort: true,
    proxy: { '/api': { target: API, changeOrigin: false }, '/docs': API, '/docs-assets': API, '/openapi.json': API },
  },
  preview: { port: 5185, proxy: { '/api': { target: API, changeOrigin: false } } },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) return 'charts'
          if (id.includes('node_modules/framer-motion') || id.includes('node_modules/motion-')) return 'motion'
          if (id.includes('node_modules/three') || id.includes('@react-three')) return 'three'
          return undefined
        },
      },
    },
  },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/tests/setup.ts'], include: ['src/**/*.test.{ts,tsx}'] },
})
