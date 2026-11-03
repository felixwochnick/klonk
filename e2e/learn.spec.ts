import { expect, test, type Page } from '@playwright/test'
import { APP_URL } from '../playwright.config'
import { gotoHydrated, loginWithPassword } from './utils'

// Lernmodule: Übersicht, Aufgaben mit automatischer Prüfung (Klonk-Script und Blöcke), Fortschritt im Browser.
test.use({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })

type Program = { language: 'blocks' | 'klonk', blocks?: string, klonk?: string }

/** Programme für Aufgaben vorbelegen (wie von Lernenden gespeichert) */
async function openTask(page: Page, task: string, program: Program, solved: Record<string, true> = {}) {
  await page.evaluate(({ task, program, solved }) => {
    localStorage.setItem('klonk:learn', JSON.stringify({ solved, programs: { [task]: { blocks: '', klonk: '', ...program } } }))
  }, { task, program, solved })
  await gotoHydrated(page, `${APP_URL}/learn/${task}`)
  const editor = program.language === 'blocks' ? 'blocks-editor' : 'code-editor'
  await expect(page.getByTestId(editor)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
  await expect(page.getByTestId('world-view')).toHaveAttribute('data-ready', 'true', { timeout: 15_000 })
}

async function check(page: Page) {
  await page.getByTestId('learn-check').click()
  const result = page.getByTestId('learn-result')
  await expect(result).toBeVisible({ timeout: 20_000 })
  return result
}

test.beforeEach(async ({ page }) => {
  await loginWithPassword(page, `${APP_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
})

test('Übersicht zeigt die Module mit Fortschritt', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('klonk:learn', JSON.stringify({ solved: { 'sequence/to-the-mark': true }, programs: {} })))
  await gotoHydrated(page, `${APP_URL}/learn`)
  await expect(page.getByTestId('learn-modules').getByRole('heading', { level: 2 })).toHaveCount(6)
  await expect(page.getByTestId('learn-module-sequence')).toContainText('1 von 4 Aufgaben gelöst')

  await page.getByTestId('learn-module-sequence').getByRole('link', { name: 'Weitermachen' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Erste Schritte: Anweisungen')
  await expect(page.getByTestId('learn-tasks').getByRole('link')).toHaveCount(4)
  // Weitermachen führt zur ersten ungelösten Aufgabe
  await page.getByTestId('learn-start').click()
  await expect(page).toHaveURL(/\/learn\/sequence\/around-the-corner$/)
  await page.screenshot({ path: 'test-results/learn-task.png' })
})

test('Klonk-Script: falsche Position wird erklärt, richtige Lösung freigeschaltet', async ({ page }) => {
  await openTask(page, 'sequence/to-the-mark', { language: 'klonk', klonk: 'schritt(3)' })
  await expect(await check(page)).toContainText('auf Feld 4|2 – das Ziel ist Feld 5|2')

  // Lauf mit Animation zeigt, ob das Ziel in der angezeigten Welt erreicht ist
  await page.getByTestId('run').click()
  await expect(page.getByTestId('learn-run-result')).toHaveText('Ziel nicht erreicht', { timeout: 20_000 })

  await openTask(page, 'sequence/to-the-mark', { language: 'klonk', klonk: 'schritt(4)' })
  const result = await check(page)
  await expect(result).toHaveAttribute('data-status', 'solved')
  await expect(page.getByTestId('learn-solved')).toBeVisible()
  await page.getByTestId('learn-show-solution').click()
  await expect(page.getByTestId('learn-solution')).toContainText('schritt')
  await result.getByRole('link', { name: 'Nächste Aufgabe' }).click()
  await expect(page).toHaveURL(/\/learn\/sequence\/around-the-corner$/)

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('klonk:learn')!))
  expect(stored.solved['sequence/to-the-mark']).toBe(true)
})

test('Mehrere Welten: abgezählte Lösung scheitert in der zweiten Welt', async ({ page }) => {
  await openTask(page, 'while/to-the-wall', { language: 'klonk', klonk: 'wiederhole 4 mal\n  schritt\nende\nmarkieren' })
  await expect(await check(page)).toContainText('Die Aufgabe verlangt eine bedingte Schleife')

  await openTask(page, 'while/to-the-wall', { language: 'klonk', klonk: 'wiederhole solange nicht istWand\n  schritt\n  wenn positionX == 5 dann\n    abbrechen\n  ende\nende\nmarkieren' })
  await expect(await check(page)).toContainText('In Welt 2')
  // Die gescheiterte Welt wird angezeigt
  await expect(page.getByTestId('learn-world-2')).toHaveClass(/primary/)
  await page.getByTestId('learn-show-goal').click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/learn-goal.png' })
})

test('Endlosschleifen werden erkannt', async ({ page }) => {
  await openTask(page, 'while/find-the-mark', { language: 'klonk', klonk: 'wiederhole solange wahr\n  linksDrehen\nende' })
  await expect(await check(page)).toContainText('endet das Programm nicht', { timeout: 20_000 })
})

test('Blöcke lösen eine Aufgabe', async ({ page }) => {
  const workspace = {
    blocks: {
      languageVersion: 0,
      blocks: [{
        type: 'klonk_repeat_while',
        id: 'loop',
        x: 40,
        y: 40,
        fields: { MODE: 'while' },
        inputs: {
          COND: { block: { type: 'logic_negate', id: 'not', inputs: { BOOL: { block: { type: 'klonk_is_wall', id: 'wall' } } } } },
          DO: { block: { type: 'klonk_step', id: 'step' } },
        },
        next: { block: { type: 'klonk_mark', id: 'mark', fields: { COLOR: 'yellow' } } },
      }],
    },
  }
  await openTask(page, 'while/to-the-wall', { language: 'blocks', blocks: JSON.stringify(workspace) })
  await expect(await check(page)).toHaveAttribute('data-status', 'solved')
})
