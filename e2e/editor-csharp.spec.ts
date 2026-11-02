import { expect, test, type Page } from '@playwright/test'
import { APP_URL } from '../playwright.config'
import { gotoHydrated, loginWithPassword } from './utils'

// C# (Roslyn auf .NET-WebAssembly im Worker, von /dotnet/): Kompilieren, Ausführen, Debugger, Fehler
test.use({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })

const WORLD = {
  version: 1,
  size: { width: 6, depth: 6, height: 4 },
  cells: [],
  characters: [{ id: 'klonk', model: 'female', x: 0, z: 0, direction: 'south' }],
}

async function openIde(page: Page, source: string, breakpoints: number[] = []) {
  await page.evaluate(({ source, breakpoints, world }) => {
    localStorage.setItem('klonk:program', JSON.stringify({ language: 'csharp', programs: { csharp: { source, breakpoints } } }))
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

test('C# kompilieren und ausführen (Top-Level-Anweisungen)', async ({ page }) => {
  await openIde(page, `var klonk = new Klonk();
var n = 0;
while (!klonk.IsWall())
{
    klonk.TurnLeft();
    klonk.PlaceBrick(Red);
    klonk.TurnRight();
    klonk.Step();
    n++;
}
Console.WriteLine($"Steps: {n}");`)
  await expect(page.getByTestId('language')).toContainText('C#')
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 90_000 })
  await expect(page.getByTestId('output')).toHaveText('Steps: 5')
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'test-results/editor-csharp-done.png' })
})

test('Debugger: Haltepunkt in Methode, Variablen, Einzelschritt', async ({ page }) => {
  await openIde(page, `class Program
{
    static int Twice(int x)
    {
        var y = x * 2;
        return y;
    }

    static void Main()
    {
        var sum = 0;
        for (var i = 1; i <= 3; i++) sum += Twice(i);
        Console.WriteLine(sum);
    }
}`, [6])
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'paused', { timeout: 90_000 })
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
  await openIde(page, 'var x = 0;\nwhile (true) { x++; }')
  await page.getByTestId('run').click()
  await page.getByTestId('pause').click()
  await expect(state(page)).toHaveAttribute('data-state', 'paused', { timeout: 90_000 })
  await page.getByTestId('stop').click()
  await expect(state(page)).toHaveAttribute('data-state', 'stopped')
})

test('Compiler- und Weltfehler mit Zeile, Autovervollständigung', async ({ page }) => {
  await openIde(page, 'new Klonk().Step();\nint x = "text";')
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'error', { timeout: 90_000 })
  await expect(page.getByTestId('run-error')).toContainText('Fehler in Zeile 2')
  await expect(page.getByTestId('run-error')).toContainText('C#-Fehler')

  await openIde(page, 'var k = new Klonk();\nk.TurnLeft();\nk.TurnLeft();\nk.Step();')
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'error', { timeout: 90_000 })
  await expect(page.getByTestId('run-error')).toContainText('Fehler in Zeile 4')

  await page.locator('.view-lines').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('\nk.IsW')
  await page.keyboard.press('Control+Space')
  await expect(page.locator('.suggest-widget .monaco-list-row').first()).toContainText('IsWall', { timeout: 15_000 })
})
