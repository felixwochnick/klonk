import { expect, test } from '@playwright/test'
import { ADMIN_URL, APP_URL, AUTH_URL } from '../playwright.config'
import { gotoHydrated, waitForPage } from './utils'

// Zentrale Anmeldung auf auth.*: einmal anmelden, überall angemeldet. Baut auf admin-accounts.spec.ts auf.
test.use({ locale: 'de-DE' })

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

test('/api/session liefert den Status nur an erlaubte Origins', async ({ request }) => {
  const allowed = await request.get(`${AUTH_URL}/api/session`, { headers: { origin: APP_URL } })
  expect(allowed.headers()['access-control-allow-origin']).toBe(APP_URL)
  expect(await allowed.json()).toEqual({ user: null })

  const foreign = await request.get(`${AUTH_URL}/api/session`, { headers: { origin: 'https://evil.example' } })
  expect(foreign.headers()['access-control-allow-origin']).toBeUndefined()
})
