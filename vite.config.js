import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const sentryRelease = process.env.VITE_SENTRY_RELEASE
  || process.env.VERCEL_GIT_COMMIT_SHA
  || `flexierp@${packageJson.version}`

// https://vite.dev/config/
export default defineConfig({
  appType: 'spa',
  define: {
    __SENTRY_RELEASE__: JSON.stringify(sentryRelease),
  },
  plugins: [react()],
  optimizeDeps: {
    include: [
      '@mantine/core',
      '@mantine/hooks',
      '@tanstack/react-table',
      '@tanstack/table-core',
      '@tanstack/react-store',
    ],
  },
  server: {
    historyApiFallback: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5050',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  preview: {
    historyApiFallback: true
  }
})
