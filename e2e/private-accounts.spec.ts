import { expect, test, type Page } from '@playwright/test'
import { ADMIN_URL, APP_URL } from '../playwright.config'
import { gotoHydrated } from './utils'

// Klonk ID (Betreiberzugang) gegen Dex (`pnpm sso:up`); baut auf admin-accounts.spec.ts auf
test.use({ locale: 'de-DE' })

test.beforeAll(async () => {
  const dex = await fetch('http://localhost:5556/dex/.well-known/openid-configuration').catch(() => null)
  test.skip(!dex?.ok, 'Test-IdP läuft nicht (pnpm sso:up)')
})

async function loginWithKlonkId(page: Page, baseUrl: string, username: string) {
  await gotoHydrated(page, `${baseUrl}/login`)
  await page.getByRole('button', { name: 'Mit Klonk ID anmelden' }).click()
  await page.locator('#login').fill(username)
  await page.locator('#password').fill(`${username}-pass`)
  await page.locator('#submit-login').click()
}

test('Klonk ID nur in der Verwaltung, Social-Login nur in der App', async ({ page }) => {
  await gotoHydrated(page, `${APP_URL}/login`)
  await expect(page.getByRole('button', { name: 'Mit Klonk ID anmelden' })).toHaveCount(0)

  await gotoHydrated(page, `${ADMIN_URL}/login`)
  await expect(page.getByRole('button', { name: 'Mit Klonk ID anmelden' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Google|GitHub/ })).toHaveCount(0)
})

test('Klonk ID ohne Betreiber-Gruppe wird abgelehnt', async ({ page }) => {
  await loginWithKlonkId(page, ADMIN_URL, 'tim')
  await expect(page).toHaveURL(/\/login\?error=not_operator/)
  await expect(page.getByText('Die Klonk ID ist nur für Entwickler:innen und Besitzer:innen.')).toBeVisible()
  await expect(page.getByTestId('user-menu')).toHaveCount(0)
})

test('Betreiber:in per Klonk ID verwaltet alle Organisationen', async ({ page }) => {
  await loginWithKlonkId(page, ADMIN_URL, 'anna')
  await expect(page).toHaveURL(/\/organizations$/)
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' })
  await expect(page.getByRole('link', { name: 'Gymnasium Musterstadt' })).toBeVisible()

  // Neue Organisation (Unternehmen) anlegen und deren Konten öffnen
  await page.getByRole('button', { name: 'Organisation anlegen' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'Unternehmen' }).click()
  await dialog.getByLabel('Name', { exact: true }).first().fill('Muster GmbH')
  await dialog.getByLabel('Domain').fill('muster-gmbh.de')
  await dialog.getByLabel('Name', { exact: true }).nth(1).fill('Max Chef')
  await dialog.getByLabel('Startpasswort').fill('chef-start')
  await dialog.getByRole('button', { name: 'Organisation anlegen' }).click()

  await page.getByRole('link', { name: 'Muster GmbH' }).click()
  await expect(page.getByRole('heading', { name: 'Konten · Muster GmbH' })).toBeVisible()
  await expect(page.getByRole('row', { name: /Max Chef/ })).toContainText('admin@muster-gmbh.de')
})
