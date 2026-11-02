import { expect, test } from '@playwright/test'
import { APP_URL } from '../playwright.config'
import { gotoHydrated, loginWithPassword } from './utils'

// Welt-Editor und 3D-Ansicht. Baut auf admin-accounts.spec.ts auf (Konto von Ada).
test.use({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })

test('Welt anzeigen, Figur steuern und Fehler melden', async ({ page }) => {
  await loginWithPassword(page, `${APP_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
  await gotoHydrated(page, `${APP_URL}/world`)
  await expect(page.getByTestId('world-view')).toHaveAttribute('data-ready', 'true', { timeout: 15_000 })
  await expect(page.locator('[data-testid="world-view"] canvas')).toBeVisible()

  // Startzustand der Standardwelt
  await expect(page.getByTestId('status-position')).toHaveText('Feld (1|1)')
  await expect(page.getByTestId('status-direction')).toHaveText('Süden')

  await page.getByTestId('mode-play').click()
  await page.getByRole('button', { name: 'Schritt' }).click()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByTestId('status-position')).toHaveText('Feld (1|3)')

  // Ziegel hinlegen und aufheben
  await page.keyboard.press('h')
  await page.keyboard.press('h')
  await expect(page.getByTestId('status-front')).toHaveText('2 Ziegel voraus')
  await page.getByRole('button', { name: 'Aufheben' }).click()
  await expect(page.getByTestId('status-front')).toHaveText('1 Ziegel voraus')

  // Marke setzen
  await page.keyboard.press('m')
  await expect(page.getByTestId('status-mark')).toBeVisible()

  // Gegen die Wand laufen ⇒ verständliche Fehlermeldung
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(page.getByText('Da ist eine Wand – hier geht es nicht weiter.', { exact: true })).toBeVisible()
  await expect(page.getByTestId('status-front')).toHaveText('Wand voraus')

  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/world-play.png' })

  // Zurücksetzen stellt die Startwelt wieder her
  await page.getByRole('button', { name: 'Zurücksetzen', exact: true }).click()
  await expect(page.getByTestId('status-position')).toHaveText('Feld (1|1)')
})

test('Editor: Welt bauen, speichern und laden', async ({ page }) => {
  await loginWithPassword(page, `${APP_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
  await gotoHydrated(page, `${APP_URL}/world`)
  await expect(page.getByTestId('world-view')).toHaveAttribute('data-ready', 'true', { timeout: 15_000 })

  // Eine Welt per Datei laden: Treppe, Quader, Marke (eine Figur – geht auch in der kostenlosen Version)
  const world = {
    version: 1,
    size: { width: 6, depth: 5, height: 4 },
    cells: [
      { x: 1, z: 0, bricks: ['red'] },
      { x: 2, z: 0, bricks: ['blue', 'yellow'] },
      { x: 3, z: 0, bricks: ['green', 'green', 'orange', 'red'] },
      { x: 4, z: 2, block: true },
      { x: 2, z: 3, mark: 'yellow' },
    ],
    characters: [
      { id: 'a', model: 'female', x: 0, z: 0, direction: 'east' },
    ],
  }
  await page.getByTestId('world-file').setInputFiles({ name: 'treppe.klonkworld.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(world)) })
  await expect(page.getByTestId('status-front')).toHaveText('1 Ziegel voraus')

  // Treppe hochsteigen, an der zu hohen Stufe scheitern
  await page.getByTestId('mode-play').click()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(page.getByText('Zu hoch! Die Figur kann nur einen Ziegel hoch oder runter steigen.', { exact: true })).toBeVisible()
  await expect(page.getByTestId('status-position')).toHaveText('Feld (3|1)')

  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/world-stairs.png' })

  // Speichern liefert dieselbe Welt (Startzustand, nicht der Probelauf)
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Speichern' }).click()
  const file = await (await download).path()
  const saved = JSON.parse(await import('node:fs/promises').then(fs => fs.readFile(file, 'utf8')))
  expect(saved.cells).toEqual(world.cells)
  expect(saved.characters).toEqual(world.characters)

  // Die Startwelt bleibt nach dem Neuladen erhalten
  await gotoHydrated(page, `${APP_URL}/world`)
  await expect(page.getByTestId('status-front')).toHaveText('1 Ziegel voraus')
})

test('Figuren benennen (Name für die Objekt-API)', async ({ page }) => {
  await loginWithPassword(page, `${APP_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
  await page.evaluate(() => localStorage.setItem('klonk:world', JSON.stringify({
    version: 1, size: { width: 4, depth: 4, height: 3 }, cells: [], characters: [{ id: 'klonk', model: 'female', x: 0, z: 0, direction: 'south' }],
  })))
  await gotoHydrated(page, `${APP_URL}/world`)
  const name = page.getByTestId('character-names').getByRole('textbox')
  await expect(name).toHaveValue('klonk')
  await name.fill('Karla')
  await name.press('Enter')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('klonk:world')!).characters[0].id)).toBe('Karla')

  // Ungültig ⇒ Meldung, alter Name bleibt
  await name.fill('a/b')
  await name.press('Enter')
  await expect(page.getByText('„a/b“ ist kein gültiger Name', { exact: false })).toBeVisible()
  await expect(name).toHaveValue('Karla')
})
