import { expect, test, type Page } from '@playwright/test'
import { APP_URL } from '../playwright.config'
import { gotoHydrated, loginWithPassword } from './utils'

// Programmieren mit Klonk-Script: Ausführen, Fehler, Debugger, Übersetzen, Editorhilfen.
// Baut auf admin-accounts.spec.ts auf (Konto von Ada).
test.use({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })

const WORLD = {
  version: 1,
  size: { width: 6, depth: 6, height: 4 },
  cells: [],
  characters: [{ id: 'klonk', model: 'male', x: 0, z: 0, direction: 'south' }],
}

/** Programm und Startwelt im Browser hinterlegen und die IDE öffnen */
async function openIde(page: Page, source: string, breakpoints: number[] = []) {
  await page.evaluate(({ source, breakpoints, world }) => {
    localStorage.setItem('klonk:program', JSON.stringify({ source, breakpoints }))
    localStorage.setItem('klonk:world', JSON.stringify(world))
  }, { source, breakpoints, world: WORLD })
  await gotoHydrated(page, `${APP_URL}/`)
  await expect(page.getByTestId('code-editor')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
  await expect(page.getByTestId('world-view')).toHaveAttribute('data-ready', 'true', { timeout: 15_000 })
}

const state = (page: Page) => page.getByTestId('run-state')

test.beforeEach(async ({ page }) => {
  await loginWithPassword(page, `${APP_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
})

test('Programm ausführen', async ({ page }) => {
  await openIde(page, `wiederhole solange nicht istWand
  linksDrehen
  hinlegen(blau)
  rechtsDrehen
  schritt
ende
markieren
ausgabe("fertig in Zeile " + positionY)`)
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'running')
  await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 30_000 })
  await expect(page.getByTestId('output')).toHaveText('fertig in Zeile 6')
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'test-results/editor-done.png' })
})

test('Laufzeitfehler mit Zeile', async ({ page }) => {
  await openIde(page, 'schritt\nrechtsDrehen\nschritt')
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'error', { timeout: 15_000 })
  await expect(page.getByTestId('run-error')).toContainText('Fehler in Zeile 3')
  await expect(page.getByTestId('run-error')).toContainText('Da ist eine Wand')
})

test('Debugger: Haltepunkt, Variablen, Einzelschritt, Weiter', async ({ page }) => {
  await openIde(page, 'var x = 1\nx = x + 1\nschritt\nausgabe(x)', [3])
  await expect(page.locator('.klonk-breakpoint')).toHaveCount(1)
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'paused', { timeout: 15_000 })
  await expect(page.getByTestId('variable-x')).toContainText('2')
  await expect(page.locator('.klonk-active-line')).toHaveCount(1)

  await page.getByTestId('step').click()
  await expect(state(page)).toHaveAttribute('data-state', 'paused')
  await expect(page.getByTestId('output')).toHaveText('Noch keine Ausgabe.')

  await page.getByTestId('resume').click()
  await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 15_000 })
  await expect(page.getByTestId('output')).toHaveText('2')
})

test('Endlosschleife lässt sich pausieren und stoppen', async ({ page }) => {
  await openIde(page, 'var i = 0\nwiederhole immer\n  i = i + 1\nende')
  await page.getByTestId('run').click()
  await page.getByTestId('pause').click()
  await expect(state(page)).toHaveAttribute('data-state', 'paused', { timeout: 15_000 })
  await expect(page.getByTestId('variables')).toBeVisible()
  await page.getByTestId('stop').click()
  await expect(state(page)).toHaveAttribute('data-state', 'stopped')
})

test('Editorhilfen: Live-Fehler, Autovervollständigung, Übersetzen', async ({ page }) => {
  await openIde(page, 'wiederhole 3 mal\n  schritt')
  // Fehlendes „ende“ wird beim Tippen markiert
  await expect(page.locator('.squiggly-error')).toHaveCount(1, { timeout: 10_000 })

  // Autovervollständigung schlägt deutsche Befehle vor
  await page.locator('.view-lines').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('ende')
  await page.keyboard.press('Escape')
  await expect(page.locator('.squiggly-error')).toHaveCount(0, { timeout: 10_000 })
  // „ende“ wird beim Tippen automatisch ausgerückt
  await expect(page.locator('.view-line').nth(2)).toHaveText('ende')
  await page.keyboard.press('Enter')
  await page.keyboard.type('rechtsD')
  await page.waitForTimeout(300)
  await page.keyboard.press('Control+Space')
  await expect(page.locator('.suggest-widget .monaco-list-row').first()).toContainText('rechtsDrehen', { timeout: 10_000 })
  await page.keyboard.press('Escape')

  // Übersetzen ins Englische
  await page.getByRole('button', { name: 'Übersetzen' }).click()
  await page.getByRole('menuitem', { name: 'English' }).click()
  await expect(page.locator('.view-lines')).toContainText('repeat 3 times')
  await expect(page.locator('.view-lines')).toContainText('step')
  await page.screenshot({ path: 'test-results/editor-translated.png' })
})
