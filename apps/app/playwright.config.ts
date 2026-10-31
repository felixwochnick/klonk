import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: process.env.KLONK_BASE_URL ?? 'http://localhost:3000',
    launchOptions: {
      // Lokal installiertes Chromium nutzen (CHROMIUM_PATH überschreibt)
      executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    },
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
