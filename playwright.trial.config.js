import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'ui-trial.spec.js',
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--disable-quic'],
    },
  },
  projects: [
    {
      name: 'desktop',
      use: {
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'mobile',
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
      },
    },
  ],
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5174',
    url: 'http://127.0.0.1:5174/login',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
