import { expect, test, type Page } from '@playwright/test'
import { APP_URL } from '../playwright.config'
import { gotoHydrated, loginWithPassword } from './utils'

// Robot-Karol-Dateien: Programme (.kdp) als Blöcke/Klonk-Script, Welten (.kdw) als Klonk-Welt – im Explorer und im Welt-Editor.
test.use({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })

// Eigene Beispiele im Format von Robot Karol (Windows, Latin-1)
const PROGRAM = Buffer.from(`{ Karol räumt den Gang auf }\r
Anweisung Einsammeln\r
  wiederhole solange IstZiegel\r
    Aufheben\r
  *wiederhole\r
*Anweisung\r
\r
Programm\r
  wiederhole solange NichtIstWand\r
    Einsammeln\r
    Schritt\r
  *wiederhole\r
  MarkeLöschen\r
  Quader\r
*Programm\r
`, 'latin1')
// 4 × 1 Felder: Karol auf (0,0) mit Blick nach Osten, 1 und 2 Ziegel, Marke am Ende
const WORLD = Buffer.from('KarolVersion2Deutsch 4 1 3 0 0 3 n n n o z n n o z z n o n n n m', 'latin1')

async function seedProject(page: Page, name: string) {
  await page.evaluate(async (name) => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('klonk-projects', { create: true })
    await root.removeEntry(name, { recursive: true }).catch(() => {})
    const dir = await root.getDirectoryHandle(name, { create: true })
    const writable = await (await dir.getFileHandle('notizen.klonk', { create: true })).createWritable()
    await writable.write('// Platz für eigene Programme\n')
    await writable.close()
  }, name)
}

test.beforeEach(async ({ page }) => {
  await loginWithPassword(page, `${APP_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
})

test('Robot-Karol-Programm als Blöcke und Welt importieren und ausführen', async ({ page }) => {
  await gotoHydrated(page, `${APP_URL}/projects`)
  await seedProject(page, 'Karol')
  await page.reload()
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' })
  await page.getByTestId('explorer-project-Karol').click()
  await expect(page.getByTestId('explorer-project-name')).toHaveText('Karol')

  await page.getByTestId('explorer-new-file').click()
  await page.getByRole('menuitem', { name: 'Robot Karol importieren' }).hover()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'als Blöcke' }).click()
  await (await chooser).setFiles([
    { name: 'gang.kdp', mimeType: 'application/octet-stream', buffer: PROGRAM },
    { name: 'gang.kdw', mimeType: 'application/octet-stream', buffer: WORLD },
  ])
  const toast = page.getByRole('region', { name: /Notifications|Benachrichtigungen/ }).getByText('Umgewandelt: gang.blocks, gang.klonkworld.json')
  await expect(toast).toBeVisible()
  await expect(page.getByText('gang.kdp: Zeile 14: Quader (Quader setzen/entfernen) gibt es in Klonk-Programmen nicht').first()).toBeVisible()
  await expect(page.getByTestId('explorer-file-gang.blocks')).toContainText('Blöcke')

  // Welt als Projektwelt, Programm in der IDE: Blöcke ⇒ Klonk-Script, läuft in der umgewandelten Welt
  await page.getByTestId('explorer-file-gang.klonkworld.json').click()
  await expect(page.getByTestId('explorer-file-gang.klonkworld.json')).toContainText('Projektwelt')
  await page.getByTestId('explorer-file-gang.blocks').click()
  await expect(page).toHaveURL(`${APP_URL}/`)
  await expect(page.getByTestId('blocks-editor')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
  await expect(page.getByTestId('world-view')).toHaveAttribute('data-ready', 'true', { timeout: 15_000 })
  await page.getByTestId('toggle-code').click()
  await expect(page.getByTestId('generated-code')).toContainText('wiederhole solange nicht istWand')
  await expect(page.getByTestId('generated-code')).toContainText('anweisung Einsammeln')
  await page.screenshot({ path: 'test-results/karol-blocks.png' })
  await page.getByTestId('run').click()
  await expect(page.getByTestId('run-state')).toHaveAttribute('data-state', 'done', { timeout: 30_000 })
})

test('Welt-Editor öffnet Robot-Karol-Welten', async ({ page }) => {
  await gotoHydrated(page, `${APP_URL}/world`)
  await page.getByTestId('world-file').setInputFiles({ name: 'gang.kdw', mimeType: 'application/octet-stream', buffer: WORLD })
  await expect.poll(() => page.evaluate(() => {
    const world = JSON.parse(localStorage.getItem('klonk:world') ?? '{}') as { size?: { width: number }, characters?: { id: string }[] }
    return `${world.size?.width}:${world.characters?.[0]?.id}`
  })).toBe('4:Karol')
})
