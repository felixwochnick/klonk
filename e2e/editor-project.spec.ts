import { expect, test, type Page } from '@playwright/test'
import { APP_URL } from '../playwright.config'
import { gotoHydrated, loginWithPassword } from './utils'

// Projekte: Browser-Projekte (Origin Private File System) – dieselbe Code-Strecke wie echte Ordner.
test.use({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })

const WORLD = {
  version: 1,
  size: { width: 4, depth: 4, height: 3 },
  cells: [],
  characters: [{ id: 'k', model: 'male', x: 0, z: 0, direction: 'east' }],
}

/** Browser-Projekt direkt im OPFS anlegen */
async function seedProject(page: Page, name: string, files: Record<string, string>) {
  await page.evaluate(async ({ name, files }) => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('klonk-projects', { create: true })
    await root.removeEntry(name, { recursive: true }).catch(() => {})
    const dir = await root.getDirectoryHandle(name, { create: true })
    for (const [path, content] of Object.entries(files)) {
      const writable = await (await dir.getFileHandle(path, { create: true })).createWritable()
      await writable.write(content)
      await writable.close()
    }
  }, { name, files })
}

async function readProjectFile(page: Page, name: string, path: string) {
  return page.evaluate(async ({ name, path }) => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('klonk-projects')
    const file = await (await (await root.getDirectoryHandle(name)).getFileHandle(path)).getFile()
    return file.text()
  }, { name, path })
}

async function openIde(page: Page) {
  await gotoHydrated(page, `${APP_URL}/`)
  await page.getByTestId('toggle-project').click()
  await expect(page.getByTestId('project-panel')).toBeVisible()
}

const state = (page: Page) => page.getByTestId('run-state')

test.beforeEach(async ({ page }) => {
  await loginWithPassword(page, `${APP_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
})

test('Neues Browser-Projekt mit Programm und Welt', async ({ page }) => {
  await openIde(page)
  await page.evaluate(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('klonk-projects', { create: true })
    await root.removeEntry('Mein Projekt', { recursive: true }).catch(() => {})
  })
  await page.getByTestId('new-browser-project').click()
  await page.getByTestId('project-dialog-submit').click()
  await expect(page.getByTestId('project-name')).toHaveText('Mein Projekt')
  await expect(page.getByTestId('file-programm.blocks')).toBeVisible()
  await expect(page.getByTestId('file-welt.klonkworld.json')).toBeVisible()
  await expect(page.getByTestId('blocks-editor')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })

  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 30_000 })
})

test('Dateien wechseln, automatisch speichern, Welt aus dem Projekt', async ({ page }) => {
  await openIde(page)
  await seedProject(page, 'Speichern', {
    'start.klonk': 'schritt\nausgabe(positionX)\n',
    'zweites.js': 'step(); step()\nprint(positionX())\n',
    'klein.klonkworld.json': JSON.stringify(WORLD),
    'notizen.txt': 'nicht editierbar',
  })
  await page.reload()
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' })
  await page.getByTestId('toggle-project').click()
  await page.getByTestId('browser-project-Speichern').click()
  await expect(page.getByTestId('project-name')).toHaveText('Speichern')
  await expect(page.getByTestId('code-editor')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
  await expect(page.getByTestId('project-world')).toContainText('klein.klonkworld.json')

  // Programm in der Projektwelt (Figur schaut nach Osten) ausführen
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 30_000 })
  await expect(page.getByTestId('output')).toHaveText('2')

  // Bearbeiten wird automatisch gespeichert
  await page.locator('.view-lines').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('// geändert')
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 5_000 })
  await expect.poll(() => readProjectFile(page, 'Speichern', 'start.klonk')).toContain('// geändert')

  // Andere Datei: Sprache folgt der Endung
  await page.getByTestId('file-zweites.js').click()
  await expect(page.getByTestId('language')).toContainText('JavaScript')
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 30_000 })
  await expect(page.getByTestId('output')).toHaveText('3')
  await page.screenshot({ path: 'test-results/project.png' })

  // Umbenennen und Löschen
  await page.getByRole('button', { name: 'Aktionen für zweites.js' }).click()
  await page.getByRole('menuitem', { name: 'Umbenennen' }).click()
  await page.getByTestId('project-dialog-name').fill('umbenannt.js')
  await page.getByTestId('project-dialog-submit').click()
  await expect(page.getByTestId('file-umbenannt.js')).toBeVisible()
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: 'Aktionen für umbenannt.js' }).click()
  await page.getByRole('menuitem', { name: 'Löschen' }).click()
  await expect(page.getByTestId('file-umbenannt.js')).toHaveCount(0)

  // Nach dem Neuladen: zuletzt geöffnete Datei
  await page.reload()
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' })
  await page.getByTestId('toggle-project').click()
  await page.getByTestId('browser-project-Speichern').click()
  await expect(page.locator('.view-lines')).toContainText('schritt')
})

test('Bibliotheken aus dem Projekt (mit Lizenz)', async ({ page }) => {
  await openIde(page)
  await seedProject(page, 'Bibliothek', {
    'haupt.klonk': 'importiere "werkzeuge.klonk"\nzweiSchritte\nausgabe(positionX)\n',
    'werkzeuge.klonk': 'anweisung zweiSchritte\n  schritt\n  schritt\nende\n',
    'welt.klonkworld.json': JSON.stringify(WORLD),
  })
  await page.reload()
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' })
  await page.getByTestId('toggle-project').click()
  await page.getByTestId('browser-project-Bibliothek').click()
  await expect(page.getByTestId('code-editor')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })

  const license = await page.evaluate(() => fetch('/api/license').then(r => r.json()))
  await page.getByTestId('run').click()
  if (license.features.includes('libraries')) {
    await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 30_000 })
    await expect(page.getByTestId('output')).toHaveText('3')
  }
  else {
    await expect(state(page)).toHaveAttribute('data-state', 'error', { timeout: 30_000 })
    await expect(page.getByTestId('run-error')).toContainText('Bibliotheken')
  }
})
