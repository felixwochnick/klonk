import { expect, type Page } from '@playwright/test'

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

/** API-Aufruf aus der geöffneten Seite heraus (Cookies, Hostauflösung und Zertifikate wie im Browser) */
export function browserFetch(page: Page, url: string, init: { method?: string, body?: unknown } = {}) {
  return page.evaluate(async ({ url, method, body }) => {
    const res = await fetch(url, {
      method,
      credentials: 'include',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, ok: res.ok }
  }, { url, method: init.method ?? 'GET', body: init.body })
}

/** Pflicht-Passwortänderung nach dem ersten Login (Startpasswort) */
export async function changePassword(page: Page, current: string, next: string) {
  await waitForPage(page, url => url.pathname === '/change-password')
  await expect(page.getByRole('heading', { name: 'Passwort ändern' })).toBeVisible()
  await page.getByLabel('Aktuelles Passwort').fill(current)
  await page.getByLabel('Neues Passwort', { exact: true }).fill(next)
  await page.getByLabel('Neues Passwort wiederholen').fill(next)
  await page.getByRole('button', { name: 'Passwort speichern' }).click()
  await waitForPage(page, url => url.pathname !== '/change-password')
}
