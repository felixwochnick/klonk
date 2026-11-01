import { expect, test, type Page } from '@playwright/test'
import { APP_URL } from '../playwright.config'
import { gotoHydrated, loginWithPassword } from './utils'

// Python (Pyodide im Worker, von /pyodide/ der eigenen Origin): Ausführen, Debugger, Fehler, Autovervollständigung
test.use({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })

const WORLD = {
  version: 1,
  size: { width: 6, depth: 6, height: 4 },
  cells: [],
  characters: [{ id: 'klonk', model: 'diverse', x: 0, z: 0, direction: 'south' }],
}

async function openIde(page: Page, source: string, breakpoints: number[] = []) {
  await page.evaluate(({ source, breakpoints, world }) => {
    localStorage.setItem('klonk:program', JSON.stringify({ language: 'python', programs: { python: { source, breakpoints } } }))
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

test('Python ausführen mit der englischen API', async ({ page }) => {
  await openIde(page, `n = 0
while not is_wall():
    turn_left()
    place_brick(red)
    turn_right()
    step()
    n += 1
print("Schritte:", n, [1, 2])`)
  await expect(page.getByTestId('language')).toContainText('Python')
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 60_000 })
  await expect(page.getByTestId('output')).toHaveText('Schritte: 5 [1, 2]')
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'test-results/editor-python-done.png' })
})

test('Debugger: Haltepunkt in Funktion, Variablen, Einzelschritt', async ({ page }) => {
  await openIde(page, `def doppelt(x):
    y = x * 2
    return y

summe = 0
for i in range(1, 4):
    summe += doppelt(i)
print(summe)`, [3])
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'paused', { timeout: 60_000 })
  await expect(page.getByTestId('variable-x')).toContainText('1')
  await expect(page.getByTestId('variable-y')).toContainText('2')

  await page.getByTestId('step').click()
  await expect(state(page)).toHaveAttribute('data-state', 'paused')

  await page.locator('.klonk-breakpoint').click()
  await page.getByTestId('resume').click()
  await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 15_000 })
  await expect(page.getByTestId('output')).toHaveText('12')
})

test('Endlosschleife lässt sich pausieren und stoppen', async ({ page }) => {
  await openIde(page, 'x = 0\nwhile True:\n    x += 1\n')
  await page.getByTestId('run').click()
  await page.getByTestId('pause').click()
  await expect(state(page)).toHaveAttribute('data-state', 'paused', { timeout: 60_000 })
  await page.getByTestId('stop').click()
  await expect(state(page)).toHaveAttribute('data-state', 'stopped')
})

test('Fehler mit Zeile und Autovervollständigung', async ({ page }) => {
  await openIde(page, 'turn_left()\nturn_left()\nstep()\n')
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'error', { timeout: 60_000 })
  await expect(page.getByTestId('run-error')).toContainText('Fehler in Zeile 3')
  await expect(page.locator('.klonk-error-line')).toHaveCount(1)

  await page.locator('.view-lines').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('\nis_')
  await page.keyboard.press('Control+Space')
  await expect(page.locator('.suggest-widget .monaco-list-row').first()).toContainText('is_', { timeout: 15_000 })
})
