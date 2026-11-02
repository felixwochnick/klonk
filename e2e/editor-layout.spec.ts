import { expect, test } from '@playwright/test'
import { APP_URL } from '../playwright.config'
import { gotoHydrated, loginWithPassword } from './utils'

// Fensteraufteilung der IDE und persönliche Einstellungen. Baut auf admin-accounts.spec.ts auf (Konto von Ada).
test.use({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })

test.beforeEach(async ({ page }) => {
  await loginWithPassword(page, `${APP_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
})

test('Fenster lassen sich verschieben und bleiben so', async ({ page }) => {
  await gotoHydrated(page, `${APP_URL}/`)
  const code = page.getByTestId('code-pane')
  const output = page.getByTestId('output-pane')
  const before = (await code.boundingBox())!
  const outputBefore = (await output.boundingBox())!

  const drag = async (testId: string, dx: number, dy: number) => {
    const box = (await page.getByTestId(testId).boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 5 })
    await page.mouse.up()
  }
  await drag('split-code', 150, 0)
  await drag('split-output', 0, -100)
  await expect.poll(async () => (await code.boundingBox())!.width).toBeCloseTo(before.width + 150, -1)
  await expect.poll(async () => (await output.boundingBox())!.height).toBeCloseTo(outputBefore.height + 100, -1)

  await page.reload()
  await expect(page.locator('html[data-hydrated="true"]')).toBeAttached()
  await expect.poll(async () => (await code.boundingBox())!.width).toBeCloseTo(before.width + 150, -1)

  // Tastatur: Pfeiltasten verschieben in 16-px-Schritten
  await page.getByTestId('split-code').focus()
  await page.keyboard.press('ArrowLeft')
  await expect.poll(async () => (await code.boundingBox())!.width).toBeCloseTo(before.width + 134, -1)
})

test('Sprache und Darstellung in den Einstellungen', async ({ page }) => {
  await gotoHydrated(page, `${APP_URL}/`)
  await page.getByTestId('user-menu').click()
  await page.getByRole('menuitem', { name: 'Einstellungen' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Einstellungen')

  await page.getByTestId('settings-language').click()
  await page.getByRole('option', { name: 'English' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings')

  // Beschriftung statt Rolle: Nuxt UI aktualisiert das aria-label beim Sprachwechsel nicht sofort
  const colorMode = page.getByTestId('settings-color-mode')
  await colorMode.getByText('Dark', { exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await colorMode.getByText('Light', { exact: true }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)

  // zurück auf Deutsch (andere Tests erwarten die Browsersprache)
  await page.getByTestId('settings-language').click()
  await page.getByRole('option', { name: 'Deutsch' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Einstellungen')
})

test('Sprachwechsel: neue Sprache sofort richtig geladen (keine falschen Fehler)', async ({ page }) => {
  await page.evaluate(() => localStorage.removeItem('klonk:program'))
  await gotoHydrated(page, `${APP_URL}/`)
  for (const language of ['Python', 'TypeScript', 'JavaScript', 'TypeScript']) {
    await page.getByTestId('language').click()
    await page.getByRole('option', { name: language, exact: true }).click()
    await expect(page.locator('.view-lines')).toContainText('Klonk')
    await page.waitForTimeout(2500)
    await expect(page.locator('.squiggly-error')).toHaveCount(0)
  }
})

test('Blöcke passen sich an, Vollbild-Code', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('klonk:program', JSON.stringify({ language: 'blocks', programs: {} })))
  await gotoHydrated(page, `${APP_URL}/`)
  await expect(page.getByTestId('blocks-editor')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
  const svgWidth = () => page.locator('[data-testid="blocks-editor"] svg.blocklySvg').evaluate(e => e.getBoundingClientRect().width)
  const paneWidth = () => page.getByTestId('code-pane').evaluate(e => e.getBoundingClientRect().width)
  const box = (await page.getByTestId('split-code').boundingBox())!
  await page.mouse.move(box.x + 4, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x - 200, box.y + 200, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => Math.abs(await svgWidth() - await paneWidth())).toBeLessThan(3)

  // Vollbild: nur Werkzeugleiste + Editor, Kopfzeile verdeckt, Welt ausgeblendet
  await page.getByTestId('focus-mode').click()
  await expect(page.getByTestId('ide')).toHaveAttribute('data-focus', 'true')
  await expect(page.getByTestId('world-view')).toBeHidden()
  await expect.poll(paneWidth).toBeGreaterThan(1300)
  await expect.poll(async () => Math.abs(await svgWidth() - await paneWidth())).toBeLessThan(3)
  await page.getByTestId('run').click()
  await expect(page.getByTestId('focus-output')).toBeVisible()
  await page.getByTestId('focus-mode').click()
  await expect(page.getByTestId('world-view')).toBeVisible()
})

test('Tab „Doku“ zeigt die Kurzreferenz der Sprache; Navigation mit Kleiderschrank', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('klonk:program', JSON.stringify({ language: 'python', programs: {} })))
  await gotoHydrated(page, `${APP_URL}/`)
  await expect(page.getByRole('navigation').getByRole('link')).toHaveText(['Projekte', 'Programmieren', 'Kleiderschrank', 'Welt'])
  await page.getByTestId('tab-docs').click()
  await expect(page.getByTestId('language-docs')).toContainText('from klonk import Klonk')
  await expect(page.getByTestId('language-docs')).toContainText('klonk.turn_left()')
  await expect(page.getByTestId('world-view')).toBeHidden()
  // Ausführen zeigt wieder die Welt
  await page.getByTestId('run').click()
  await expect(page.getByTestId('world-view')).toBeVisible()

  await page.getByRole('link', { name: 'Kleiderschrank' }).click()
  await expect(page.getByTestId('wardrobe')).toContainText('Öffne oder erstelle zuerst ein Projekt')
})
