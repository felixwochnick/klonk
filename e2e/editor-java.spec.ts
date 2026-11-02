import { expect, test, type Page } from '@playwright/test'
import { APP_URL } from '../playwright.config'
import { gotoHydrated, loginWithPassword } from './utils'

// Java (teavm-javac im Worker, von /teavm/ der eigenen Origin): Kompilieren, Ausführen, Debugger, Fehler
test.use({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })

const WORLD = {
  version: 1,
  size: { width: 6, depth: 6, height: 4 },
  cells: [],
  characters: [{ id: 'klonk', model: 'female', x: 0, z: 0, direction: 'south' }],
}

async function openIde(page: Page, source: string, breakpoints: number[] = []) {
  await page.evaluate(({ source, breakpoints, world }) => {
    localStorage.setItem('klonk:program', JSON.stringify({ language: 'java', programs: { java: { source, breakpoints } } }))
    localStorage.setItem('klonk:world', JSON.stringify(world))
  }, { source, breakpoints, world: WORLD })
  await gotoHydrated(page, `${APP_URL}/`)
  await expect(page.getByTestId('code-editor')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
  await expect(page.getByTestId('world-view')).toHaveAttribute('data-ready', 'true', { timeout: 15_000 })
}

const state = (page: Page) => page.getByTestId('run-state')
const main = (body: string, extra = '') => `import klonk.Klonk; import static klonk.Klonk.*; public class Main {${extra}
    public static void main(String[] args) {
${body}
    }
}`

test.beforeEach(async ({ page }) => {
  await loginWithPassword(page, `${APP_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
})

test('Java kompilieren und ausführen', async ({ page }) => {
  await openIde(page, main(`        Klonk klonk = new Klonk();
        int n = 0;
        while (!klonk.isWall()) {
            klonk.turnLeft();
            klonk.placeBrick(RED);
            klonk.turnRight();
            klonk.step();
            n++;
        }
        System.out.println("Steps: " + n);`))
  await expect(page.getByTestId('language')).toContainText('Java')
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 60_000 })
  await expect(page.getByTestId('output')).toHaveText('Steps: 5')
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'test-results/editor-java-done.png' })
})

test('Debugger: Haltepunkt in Methode, Variablen, Einzelschritt', async ({ page }) => {
  await openIde(page, `public class Main {
    static int twice(int x) {
        int y = x * 2;
        return y;
    }

    public static void main(String[] args) {
        int sum = 0;
        for (int i = 1; i <= 3; i++) sum += twice(i);
        System.out.println(sum);
    }
}`, [4])
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
  await openIde(page, main('        int x = 0;\n        while (true) { x++; }'))
  await page.getByTestId('run').click()
  await page.getByTestId('pause').click()
  await expect(state(page)).toHaveAttribute('data-state', 'paused', { timeout: 60_000 })
  await page.getByTestId('stop').click()
  await expect(state(page)).toHaveAttribute('data-state', 'stopped')
})

test('Compiler- und Laufzeitfehler mit Zeile, Autovervollständigung', async ({ page }) => {
  await openIde(page, main('        int x = "text";'))
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'error', { timeout: 60_000 })
  await expect(page.getByTestId('run-error')).toContainText('Fehler in Zeile 3')
  await expect(page.getByTestId('run-error')).toContainText('Java-Fehler')

  await openIde(page, main('        Klonk k = new Klonk();\n        k.turnLeft();\n        k.turnLeft();\n        k.step();'))
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'error', { timeout: 60_000 })
  await expect(page.getByTestId('run-error')).toContainText('Fehler in Zeile 6')

  await page.locator('.view-lines').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('\nk.isW')
  await page.keyboard.press('Control+Space')
  await expect(page.locator('.suggest-widget .monaco-list-row').first()).toContainText('isWall', { timeout: 15_000 })
})

test('Compilerfehler schon beim Tippen', async ({ page }) => {
  await openIde(page, main('        Klonk k = new Klonk();\n        k.stepp();\n        int x = "a";'))
  await expect(page.locator('.squiggly-error')).toHaveCount(2, { timeout: 60_000 })
  await page.locator('.view-lines').getByText('stepp').hover()
  await expect(page.locator('.monaco-hover-content').filter({ hasText: 'stepp' }).first()).toBeVisible({ timeout: 10_000 })
})

test('Vorschläge: Methoden einer Figur, eigene Variablen, Import wird ergänzt', async ({ page }) => {
  await openIde(page, 'public class Main {\n    public static void main(String[] args) {\n        int anzahl = 3;\n        \n    }\n}')
  await page.locator('.view-lines').click()
  // Cursor in die leere Zeile 4
  await page.keyboard.press('Control+Home')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('End')
  await page.keyboard.type('anz')
  await page.keyboard.press('Control+Space')
  await expect(page.locator('.suggest-widget .monaco-list-row').first()).toContainText('anzahl', { timeout: 15_000 })
  await page.keyboard.press('Escape')
  await page.keyboard.type('ahl++;\n        Klo')
  await page.keyboard.press('Control+Space')
  await expect(page.locator('.suggest-widget .monaco-list-row').first()).toContainText('Klonk', { timeout: 15_000 })
  await page.keyboard.press('Enter')
  // Import oben ergänzt
  await expect(page.locator('.view-lines')).toContainText('import klonk.Klonk;')
  await page.keyboard.type(' k = new Klonk();\n        k.')
  await expect(page.locator('.suggest-widget .monaco-list-row').filter({ hasText: 'turnLeft' })).toBeVisible({ timeout: 15_000 })
})
