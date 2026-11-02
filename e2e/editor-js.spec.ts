import { expect, test, type Page } from '@playwright/test'
import { APP_URL } from '../playwright.config'
import { gotoHydrated, loginWithPassword } from './utils'

// JavaScript/TypeScript: synchrone Ausführung im Worker, Debugger über SharedArrayBuffer, Monaco-TypeScript.
test.use({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })

const WORLD = {
  version: 1,
  size: { width: 6, depth: 6, height: 4 },
  cells: [],
  characters: [{ id: 'klonk', model: 'female', x: 0, z: 0, direction: 'south' }],
}

async function openIde(page: Page, language: 'javascript' | 'typescript', source: string, breakpoints: number[] = []) {
  await page.evaluate(({ language, source, breakpoints, world }) => {
    localStorage.setItem('klonk:program', JSON.stringify({ language, programs: { [language]: { source, breakpoints } } }))
    localStorage.setItem('klonk:world', JSON.stringify(world))
  }, { language, source, breakpoints, world: WORLD })
  await gotoHydrated(page, `${APP_URL}/`)
  await expect(page.getByTestId('code-editor')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
  await expect(page.getByTestId('world-view')).toHaveAttribute('data-ready', 'true', { timeout: 15_000 })
}

const state = (page: Page) => page.getByTestId('run-state')

test.beforeEach(async ({ page }) => {
  await loginWithPassword(page, `${APP_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
})

test('Seite ist cross-origin-isoliert (Voraussetzung für JS/TS)', async ({ page }) => {
  await gotoHydrated(page, `${APP_URL}/`)
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true)
})

test('JavaScript ausführen mit der englischen Objekt-API', async ({ page }) => {
  await openIde(page, 'javascript', `const klonk = new Klonk()
let n = 0
while (!klonk.isWall()) {
  klonk.turnLeft()
  klonk.placeBrick(red)
  klonk.turnRight()
  klonk.step()
  n++
}
print('Schritte:', n, [1, 2])`)
  await expect(page.getByTestId('language')).toContainText('JavaScript')
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 30_000 })
  await expect(page.getByTestId('output')).toHaveText('Schritte: 5 [1, 2]')
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'test-results/editor-js-done.png' })
})

test('Debugger in TypeScript: Haltepunkt in Funktion, Variablen, Einzelschritt', async ({ page }) => {
  await openIde(page, 'typescript', `function doppelt(x: number): number {
  const y = x * 2
  return y
}
let summe: number = 0
for (let i = 1; i <= 3; i++) {
  summe += doppelt(i)
}
print(summe)`, [3])
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'paused', { timeout: 15_000 })
  await expect(page.getByTestId('variable-x')).toContainText('1')
  await expect(page.getByTestId('variable-y')).toContainText('2')
  await expect(page.locator('.klonk-active-line')).toHaveCount(1)

  await page.getByTestId('step').click()
  await expect(state(page)).toHaveAttribute('data-state', 'paused')

  // Haltepunkt entfernen und durchlaufen lassen
  await page.locator('.klonk-breakpoint').click()
  await expect(page.locator('.klonk-breakpoint')).toHaveCount(0)
  await page.getByTestId('resume').click()
  await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 15_000 })
  await expect(page.getByTestId('output')).toHaveText('12')
})

test('Endlosschleife ohne Befehle lässt sich pausieren und stoppen', async ({ page }) => {
  await openIde(page, 'javascript', 'let i = 0\nwhile (true) {}')
  await page.getByTestId('run').click()
  await page.getByTestId('pause').click()
  await expect(state(page)).toHaveAttribute('data-state', 'paused', { timeout: 15_000 })
  await page.getByTestId('stop').click()
  await expect(state(page)).toHaveAttribute('data-state', 'stopped')
})

test('Laufzeitfehler mit Zeile', async ({ page }) => {
  await openIde(page, 'javascript', 'new Klonk().step()\nconst a = null\na.x = 1')
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'error', { timeout: 15_000 })
  await expect(page.getByTestId('run-error')).toContainText('Fehler in Zeile 3')
  await expect(page.getByTestId('run-error')).toContainText('TypeError')
})

test('TypeScript: Typfehler und Autovervollständigung der Roboter-API', async ({ page }) => {
  await openIde(page, 'typescript', 'const n: number = "x"\n')
  await expect(page.locator('.squiggly-error')).toHaveCount(1, { timeout: 20_000 })
  await page.locator('.view-lines').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('\nnew Klonk().isW')
  await page.waitForTimeout(500)
  await page.keyboard.press('Control+Space')
  await expect(page.locator('.suggest-widget .monaco-list-row').first()).toContainText('isWall', { timeout: 15_000 })
})

test('Zwei Figuren gleichzeitig steuern', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('klonk:program', JSON.stringify({
    language: 'javascript',
    programs: { javascript: { source: 'const klonk = new Klonk()\nconst klara = new Klonk("Klara")\nfor (let i = 0; i < 3; i++) {\n  klonk.step()\n  klara.step()\n}\nprint(Klonk.all().map(k => k.name + ": " + k.positionY()).join(", "))', breakpoints: [] } },
  })))
  await page.evaluate(world => localStorage.setItem('klonk:world', JSON.stringify(world)), {
    ...WORLD,
    characters: [...WORLD.characters, { id: 'Klara', model: 'female', x: 2, z: 0, direction: 'south' }],
  })
  await gotoHydrated(page, `${APP_URL}/`)
  await expect(page.getByTestId('code-editor')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 30_000 })
  await expect(page.getByTestId('output')).toHaveText('klonk: 4, Klara: 4')
})

test('JavaScript: Tippfehler in Methoden werden markiert', async ({ page }) => {
  await openIde(page, 'javascript', 'const k = new Klonk()\nk.stepp()\n')
  await expect(page.locator('.squiggly-error')).toHaveCount(1, { timeout: 20_000 })
  await page.locator('.view-lines').getByText('stepp').hover()
  await expect(page.locator('.monaco-hover-content').filter({ hasText: 'stepp' }).first()).toBeVisible({ timeout: 10_000 })
})
