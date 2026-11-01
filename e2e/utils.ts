import type { Page } from '@playwright/test'

const hydrated = (page: Page) => page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' })

export async function gotoHydrated(page: Page, url: string) {
  await page.goto(url)
  await hydrated(page)
}

/** Nach Weiterleitungen (auch über auth.* hinweg) warten, bis die Zielseite geladen und hydriert ist */
export async function waitForPage(page: Page, matches: (url: URL) => boolean) {
  await page.waitForURL(matches)
  await page.waitForLoadState()
  await hydrated(page)
}

/** Anmeldung mit name@domain + Passwort (Login-Seite ggf. zentral auf auth.*) */
export async function loginWithPassword(page: Page, startUrl: string, identifier: string, password: string) {
  await gotoHydrated(page, startUrl)
  await page.getByLabel('Benutzername').fill(identifier)
  await page.getByRole('button', { name: 'Weiter' }).click()
  await page.getByLabel('Passwort').fill(password)
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
  await waitForPage(page, url => url.pathname !== '/login')
}
