import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { refuseProductionSupabasePlugin } from './src/utils/localSupabaseGuard.js'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const sentryRelease = process.env.VITE_SENTRY_RELEASE
  || process.env.VERCEL_GIT_COMMIT_SHA
  || `flexierp@${packageJson.version}`

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  return {
    appType: 'spa',
    define: {
      __SENTRY_RELEASE__: JSON.stringify(sentryRelease),
    },
    plugins: [
      react(),
      refuseProductionSupabasePlugin(env.VITE_SUPABASE_URL || '')
    ],
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
  }
})
