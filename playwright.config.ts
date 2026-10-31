import { defineConfig } from '@playwright/test'
import { e2eDatabaseUrl } from './e2e/db'

export const APP_URL = 'http://localhost:3010'
export const ADMIN_URL = 'http://localhost:3012'

const env = {
  NUXT_DATABASE_URL: e2eDatabaseUrl,
  NUXT_PUBLIC_APP_URL: APP_URL,
  NUXT_PUBLIC_ADMIN_URL: ADMIN_URL,
}

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // Tests teilen sich eine Datenbank und bauen aufeinander auf
  workers: 1,
  fullyParallel: false,
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      // Lokal installiertes Chromium nutzen (CHROMIUM_PATH überschreibt)
      executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    },
  },
  webServer: [
    {
      command: 'node e2e/ensure-db.ts && pnpm --filter @klonk/app exec nuxt dev --port 3010 --dotenv ../../.env',
      url: `${APP_URL}/api/health`,
      env,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node e2e/ensure-db.ts && pnpm --filter @klonk/admin exec nuxt dev --port 3012 --dotenv ../../.env',
      url: `${ADMIN_URL}/api/health`,
      env,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
