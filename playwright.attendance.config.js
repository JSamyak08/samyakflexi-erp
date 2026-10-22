import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'attendance-mark.live.spec.js',
  timeout: 120000,
  outputDir: 'artifacts/attendance/test-results',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    video: 'on',
    screenshot: 'off',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome']
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
