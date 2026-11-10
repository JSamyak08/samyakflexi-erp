import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const y4m = path.resolve('artifacts/camera/barcode.y4m');

const shared = {
  ...devices['Desktop Chrome'],
  baseURL: 'http://127.0.0.1:5173',
  video: 'on',
  screenshot: 'off',
  trace: 'retain-on-failure'
};

export default defineConfig({
  testDir: './tests',
  testMatch: 'camera-scan.live.spec.js',
  timeout: 120000,
  expect: { timeout: 20000 },
  outputDir: 'artifacts/camera/test-results',
  globalSetup: './tests/camera-scan.global-setup.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: shared,
  webServer: {
    command: 'node tests/camera-scan.server.mjs',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 120000
  },
  projects: [
    {
      name: 'fake-camera',
      use: {
        ...shared,
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            `--use-file-for-fake-video-capture=${y4m}`,
            '--autoplay-policy=no-user-gesture-required'
          ]
        }
      }
    },
    {
      name: 'no-camera',
      use: {
        ...shared,
        launchOptions: {
          args: ['--use-fake-ui-for-media-stream']
        }
      }
    }
  ]
});
