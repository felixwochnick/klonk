import { expect, test, type Page } from '@playwright/test'
import { ADMIN_URL, APP_URL } from '../playwright.config'
import { LDAP_URL, OIDC_ISSUER, testIdpAvailable } from './targets'
import { gotoHydrated, waitForPage } from './utils'

// Benötigt Test-LDAP und Dex: `pnpm sso:up`. Baut auf den Daten aus admin-accounts.spec.ts auf.
test.use({ locale: 'de-DE' })

test.beforeAll(async () => {
  test.skip(!(await testIdpAvailable()), 'Test-IdP läuft nicht (pnpm sso:up)')
})

async function lookup(page: Page, baseUrl: string, identifier: string) {
  await gotoHydrated(page, `${baseUrl}/login`)
  await page.getByLabel('Benutzername').fill(identifier)
  await page.getByRole('button', { name: 'Weiter' }).click()
}

test('Admin konfiguriert LDAP und OIDC', async ({ page }) => {
  await lookup(page, ADMIN_URL, 'admin@gym-muster.de')
  await page.getByLabel('Passwort').fill('admin-passwort')
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
  await waitForPage(page, url => url.pathname !== '/login')
  await page.getByRole('link', { name: 'Anmeldung' }).click()

  // LDAP
  await page.getByRole('switch', { name: 'LDAP / Active Directory' }).click()
  await page.getByLabel('Server URL').fill(LDAP_URL)
  await page.getByLabel('Bind DN').fill('cn=service,ou=svcaccts,dc=klonk,dc=test')
  await page.getByLabel('Bind-Passwort').fill('service-pass')
  await page.getByLabel('Base DN').fill('dc=klonk,dc=test')
  await page.getByLabel('Benutzerfilter').fill('(&(objectClass=posixAccount)(cn={{username}}))')
  await page.getByLabel('Attribut für den Benutzernamen').fill('cn')
  await page.getByLabel('Attribut für den Namen').fill('givenName')
  await page.getByLabel('Gruppen für Lehrkräfte/Ausbildende').fill('ou=teachers,ou=groups,dc=klonk,dc=test')
  await page.getByLabel('Gruppen für Admins').fill('ou=admins,ou=groups,dc=klonk,dc=test')
  await page.getByRole('button', { name: 'Verbindung testen' }).nth(1).click()
  await expect(page.getByText('4 Konten gefunden', { exact: true })).toBeVisible()

  // OIDC (Dex)
  await page.getByRole('switch', { name: 'Single Sign-on (OIDC)' }).click()
  await page.getByLabel('Issuer URL').fill(OIDC_ISSUER)
  await page.getByLabel('Client ID').fill('klonk')
  await page.getByLabel('Client Secret').fill('klonk-dev-secret')
  await page.getByLabel('Scopes').fill('openid profile email groups')
  await page.getByLabel('Claim für den Benutzernamen').fill('preferred_username')
  await page.getByLabel('Claim für Rollen/Gruppen').fill('groups')
  await page.getByLabel('Werte für Lehrkräfte/Ausbildende').fill('teachers')
  await page.getByLabel('Werte für Admins').fill('admins')
  await page.getByRole('button', { name: 'Verbindung testen' }).first().click()
  await expect(page.getByText(OIDC_ISSUER, { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible()

  // Secrets werden nicht ausgeliefert, bleiben aber gespeichert
  await gotoHydrated(page, page.url())
  await expect(page.getByLabel('Client Secret')).toHaveValue('')
  await expect(page.getByText('Leer lassen, um den gespeicherten Wert zu behalten.').first()).toBeVisible()
})

test('Anmeldung per LDAP legt das Konto an', async ({ page }) => {
  await lookup(page, APP_URL, 'tim@gym-muster.de')
  await page.getByLabel('Passwort').fill('falsch')
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
  await expect(page.getByText('Benutzername oder Passwort ist falsch.')).toBeVisible()

  await page.getByLabel('Passwort').fill('tim-pass')
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
  await waitForPage(page, url => url.pathname !== '/login')
  await expect(page.getByTestId('user-menu')).toHaveText(/Tim Schüler/)
})

test('LDAP-Eingaben können den Filter nicht manipulieren', async ({ page }) => {
  await lookup(page, APP_URL, '*@gym-muster.de')
  await page.getByLabel('Passwort').fill('tim-pass')
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
  await expect(page.getByText('Benutzername oder Passwort ist falsch.')).toBeVisible()
})

test('Anmeldung per OIDC übernimmt die Rolle aus den Gruppen', async ({ page }) => {
  await lookup(page, APP_URL, 'lisa@gym-muster.de')
  await page.getByRole('button', { name: 'Mit Gymnasium Musterstadt anmelden' }).click()

  // Login-Formular von Dex
  await page.locator('#login').fill('lisa')
  await page.locator('#password').fill('lisa-pass')
  await page.locator('#submit-login').click()

  await expect(page).toHaveURL(new RegExp(`^${APP_URL}/`))
  await expect(page.getByTestId('user-menu')).toHaveText(/Lisa Lehrerin/)

  // Als Lehrkraft hat Lisa Zugriff auf die Verwaltung (gemeinsame Session)
  await gotoHydrated(page, `${ADMIN_URL}/users`)
  await expect(page.getByRole('row', { name: /Lisa Lehrerin/ })).toContainText('Lehrkraft')
  await expect(page.getByRole('row', { name: /Tim Schüler/ })).toContainText('Schüler:in')
})
