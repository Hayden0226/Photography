import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:13333',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'AFILMORY_SKIP_MANIFEST_PRECHECK=true pnpm --filter web dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:13333',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
})
