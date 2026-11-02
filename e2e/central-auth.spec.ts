import { expect, test } from '@playwright/test'
import { ADMIN_URL, APP_URL, AUTH_URL } from '../playwright.config'
import { gotoHydrated, waitForPage } from './utils'

// Zentrale Anmeldung auf auth.*: einmal anmelden, überall angemeldet. Baut auf admin-accounts.spec.ts auf.
// Ohne zusätzliche Header: ein eigener Header würde bei den Cross-Origin-Abfragen einen CORS-Preflight auslösen
test.use({ locale: 'de-DE', extraHTTPHeaders: {} })

test('Einmal anmelden für App und Verwaltung, einmal abmelden für alle', async ({ page }) => {
  // App leitet zur zentralen Anmeldung und nach dem Login zurück
  await gotoHydrated(page, `${APP_URL}/`)
  await expect(page).toHaveURL(new RegExp(`^${AUTH_URL}/login\\?redirect=`))
  await page.getByLabel('Benutzername').fill('admin@gym-muster.de')
  await page.getByRole('button', { name: 'Weiter' }).click()
  await page.getByLabel('Passwort').fill('admin-passwort')
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
  await waitForPage(page, url => url.origin === APP_URL)
  await expect(page).toHaveURL(`${APP_URL}/`)
  await expect(page.getByTestId('user-menu')).toHaveText(/Ada Admin/)

  // Verwaltung und auth.* kennen die Anmeldung bereits
  await gotoHydrated(page, `${ADMIN_URL}/users`)
  await expect(page).toHaveURL(`${ADMIN_URL}/users`)
  await gotoHydrated(page, `${AUTH_URL}/`)
  await expect(page.getByTestId('auth-user')).toHaveText('Ada Admin')

  // Abmelden in der Verwaltung beendet die Session überall
  await gotoHydrated(page, `${ADMIN_URL}/users`)
  await page.getByTestId('user-menu').click()
  await page.getByRole('menuitem', { name: 'Abmelden' }).click()
  await expect(page).toHaveURL(new RegExp(`^${AUTH_URL}/login`))
  await gotoHydrated(page, `${APP_URL}/`)
  await expect(page).toHaveURL(new RegExp(`^${AUTH_URL}/login`))
})

test('Fremde Weiterleitungsziele werden ignoriert', async ({ page }) => {
  await gotoHydrated(page, `${AUTH_URL}/login?redirect=${encodeURIComponent('https://evil.example/phish')}`)
  await page.getByLabel('Benutzername').fill('admin@gym-muster.de')
  await page.getByRole('button', { name: 'Weiter' }).click()
  await page.getByLabel('Passwort').fill('admin-passwort')
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
  await expect(page).toHaveURL(`${AUTH_URL}/`)
})

test('/api/session liefert den Status nur an erlaubte Origins', async ({ page }) => {
  // Abfrage aus der gerade geöffneten Seite heraus, wie es die Website tun würde
  const fetchSession = () => page.evaluate(
    url => fetch(url, { credentials: 'include' }).then(r => r.json()).catch(() => 'blocked'),
    `${AUTH_URL}/api/session`,
  )

  // Erlaubte Seite (App): Anmeldestatus per CORS lesbar
  await page.goto(`${APP_URL}/api/health`)
  expect(await fetchSession()).toEqual({ user: null })

  // Fremde Seite: der Browser blockiert die Antwort
  await page.route('https://evil.example/**', route => route.fulfill({ body: '<html></html>', contentType: 'text/html' }))
  await page.goto('https://evil.example/')
  expect(await fetchSession()).toBe('blocked')
})
