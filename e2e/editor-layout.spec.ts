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
