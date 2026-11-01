import { expect, test } from '@playwright/test'
import { APP_URL } from '../playwright.config'
import { STACK } from './targets'
import { gotoHydrated, loginWithPassword } from './utils'

// PWA: Service Worker gibt es nur im Produktions-Build ⇒ nur gegen den Stack (KLONK_E2E_TARGET=stack)
test.skip(!STACK, 'Service Worker nur im Produktions-Build')
test.use({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })

const hydrated = (page: import('@playwright/test').Page) => page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' })

test('Installierbar und offline nutzbar', async ({ page, context }) => {
  await loginWithPassword(page, `${APP_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
  await gotoHydrated(page, `${APP_URL}/`)

  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]')?.getAttribute('href')
    return href ? (await fetch(href)).json() : null
  })
  expect(manifest).toMatchObject({ name: 'Klonk', display: 'standalone' })
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)

  // Service Worker installiert (Precache fertig) und steuert die Seite
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await hydrated(page)
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true)

  await page.evaluate(() => {
    localStorage.setItem('klonk:program', JSON.stringify({ language: 'klonk', programs: { klonk: { source: 'schritt\nausgabe("offline")\n', breakpoints: [] } } }))
  })

  // Offline: Seite neu laden, Welt-Editor und IDE funktionieren, Programme laufen im Worker
  const failed: string[] = []
  page.on('requestfailed', request => failed.push(request.url()))
  await context.setOffline(true)
  await page.goto(`${APP_URL}/world`)
  await hydrated(page)
  await expect(page.getByTestId('offline-badge')).toBeVisible()
  await expect(page.getByTestId('world-view')).toBeVisible()

  await page.goto(`${APP_URL}/`)
  await hydrated(page)
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true)
  await expect(page.getByTestId('code-editor')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 })
  await page.getByTestId('run').click()
  await expect(page.getByTestId('run-state')).toHaveAttribute('data-state', 'done', { timeout: 30_000 })
  await expect(page.getByTestId('output')).toHaveText('offline')
  await page.screenshot({ path: 'test-results/pwa-offline.png' })
  // Alles kam aus dem Cache bzw. dem Bundle (z. B. keine nachgeladenen Symbole)
  expect(failed.filter(url => !url.includes('/api/'))).toEqual([])

  await context.setOffline(false)
})
