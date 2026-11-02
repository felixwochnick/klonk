import { defineConfig } from '@playwright/test'
import { e2eDatabaseUrl } from './e2e/db'

import { ADMIN_URL, APP_URL, AUTH_URL, OIDC_ISSUER, STACK } from './e2e/targets'

export { ADMIN_URL, APP_URL, AUTH_URL }

const env = {
  NUXT_DATABASE_URL: e2eDatabaseUrl,
  NUXT_PUBLIC_APP_URL: APP_URL,
  NUXT_PUBLIC_ADMIN_URL: ADMIN_URL,
  NUXT_PUBLIC_AUTH_URL: AUTH_URL,
  // Klonk ID gegen den Test-IdP (Dex, `pnpm sso:up`): Gruppe `admins` ⇒ Besitzer:in
  NUXT_PLATFORM_OIDC_ISSUER: OIDC_ISSUER,
  NUXT_PLATFORM_OIDC_CLIENT_ID: 'klonk',
  NUXT_PLATFORM_OIDC_CLIENT_SECRET: 'klonk-dev-secret',
  NUXT_PLATFORM_OIDC_SCOPES: 'openid profile email groups',
  NUXT_PLATFORM_OIDC_OWNER_GROUPS: 'admins',
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
    // Stack: selbst signierte Zertifikate (*.localhost löst der Browser selbst auf)
    ignoreHTTPSErrors: STACK,
    // Lokalen Testmodus (alles frei auf *.localhost) abschalten – die Tests prüfen die echten Lizenzgrenzen
    extraHTTPHeaders: { 'x-klonk-local': 'off' },
    launchOptions: {
      // Lokal installiertes Chromium nutzen (CHROMIUM_PATH überschreibt)
      executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
      // Service Worker (PWA) registrieren sich nur bei gültigem Zertifikat – im Stack selbst signiert
      args: STACK ? ['--ignore-certificate-errors'] : [],
    },
  },
  webServer: STACK ? undefined : [
    {
      command: 'node e2e/ensure-db.ts && pnpm --filter @klonk/auth exec nuxt dev --port 3013 --dotenv ../../.env',
      url: `${AUTH_URL}/api/health`,
      env,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      // C#-Host (dotnet publish) vorher bauen, falls er fehlt oder veraltet ist
      command: 'node e2e/ensure-db.ts && node scripts/build-csharp.ts --if-missing && pnpm --filter @klonk/app exec nuxt dev --port 3010 --dotenv ../../.env',
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
