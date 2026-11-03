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
      // Unterordner anlegen (`a/b.klonk`)
      const parts = path.split('/')
      let parent = dir
      for (const part of parts.slice(0, -1)) parent = await parent.getDirectoryHandle(part, { create: true })
      const writable = await (await parent.getFileHandle(parts.at(-1)!, { create: true })).createWritable()
      await writable.write(content)
      await writable.close()
    }
  }, { name, files })
}

async function readProjectFile(page: Page, name: string, path: string) {
  return page.evaluate(async ({ name, path }) => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('klonk-projects')
    let dir = await root.getDirectoryHandle(name)
    const parts = path.split('/')
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part)
    const file = await (await dir.getFileHandle(parts.at(-1)!)).getFile()
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
    'zweites.js': 'import { Klonk } from "klonk"; const k = new Klonk()\nk.step(); k.step()\nconsole.log(k.positionX())\n',
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
  await expect.poll(() => readProjectFile(page, 'Speichern', 'start.klonk').catch(() => '')).toContain('// geändert')

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

test('Vollbild-Explorer: Kacheln, Suche, Welt wählen, Programm in der IDE öffnen', async ({ page }) => {
  await gotoHydrated(page, `${APP_URL}/projects`)
  await seedProject(page, 'Explorer', {
    'start.klonk': 'schritt\nausgabe(positionX)\n',
    'hilfe.ts': 'import { Klonk } from "klonk"\nnew Klonk().step()\n',
    'welt.klonkworld.json': JSON.stringify(WORLD),
  })
  await page.reload()
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' })
  await page.getByTestId('explorer-project-Explorer').click()
  await expect(page.getByTestId('explorer-project-name')).toHaveText('Explorer')
  await expect(page.getByTestId('explorer-file-hilfe.ts')).toContainText('TypeScript')

  await page.getByPlaceholder('Dateien suchen').fill('hilfe')
  await expect(page.getByTestId('explorer-file-start.klonk')).toHaveCount(0)
  await page.getByPlaceholder('Dateien suchen').fill('')

  await page.getByTestId('explorer-file-welt.klonkworld.json').click()
  await expect(page.getByTestId('explorer-file-welt.klonkworld.json')).toContainText('Projektwelt')
  await page.screenshot({ path: 'test-results/explorer.png' })

  await page.getByTestId('explorer-file-start.klonk').click()
  await expect(page).toHaveURL(`${APP_URL}/`)
  await expect(page.locator('.view-lines')).toContainText('schritt')
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 30_000 })
  await expect(page.getByTestId('output')).toHaveText('2')
})

test('Ordner: anlegen, Dateien darin, verschieben, umbenennen, im Explorer öffnen', async ({ page }) => {
  await openIde(page)
  await seedProject(page, 'Ordner', {
    'start.klonk': 'schritt\n',
    'welt.klonkworld.json': JSON.stringify(WORLD),
  })
  await page.reload()
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' })
  await page.getByTestId('toggle-project').click()
  await page.getByTestId('browser-project-Ordner').click()
  await expect(page.getByTestId('project-name')).toHaveText('Ordner')

  // Neuer Ordner über „Neue Datei“ ⇒ „Ordner“
  await page.getByTestId('new-file').click()
  await page.getByRole('menuitem', { name: 'Ordner' }).click()
  await page.getByTestId('project-dialog-name').fill('lektion')
  await page.getByTestId('project-dialog-submit').click()
  await expect(page.getByTestId('folder-lektion')).toBeVisible()

  // Datei im Ordner anlegen
  await page.getByTestId('folder-actions-lektion').click()
  await page.getByRole('menuitem', { name: 'Neue Datei' }).click()
  await page.getByRole('menuitem', { name: 'Klonk-Script' }).click()
  await page.getByTestId('project-dialog-name').fill('aufgabe')
  await page.getByTestId('project-dialog-submit').click()
  await expect(page.getByTestId('file-lektion/aufgabe.klonk')).toBeVisible()

  // Zuklappen versteckt den Inhalt
  await page.getByTestId('folder-lektion').click()
  await expect(page.getByTestId('file-lektion/aufgabe.klonk')).toHaveCount(0)
  await page.getByTestId('folder-lektion').click()

  // start.klonk per Ziehen in den Ordner verschieben
  await page.getByTestId('file-start.klonk').dragTo(page.getByTestId('folder-lektion'))
  await expect(page.getByTestId('file-lektion/start.klonk')).toBeVisible()
  expect(await readProjectFile(page, 'Ordner', 'lektion/start.klonk')).toBe('schritt\n')

  // Ordner umbenennen: Dateien ziehen mit
  await page.getByTestId('folder-actions-lektion').click()
  await page.getByRole('menuitem', { name: 'Umbenennen' }).click()
  await page.getByTestId('project-dialog-name').fill('kapitel')
  await page.getByTestId('project-dialog-submit').click()
  await expect(page.getByTestId('file-kapitel/aufgabe.klonk')).toBeVisible()
  await expect(page.getByTestId('folder-lektion')).toHaveCount(0)

  // Vollbild-Explorer: in den Ordner wechseln
  await page.getByTestId('open-explorer').click()
  await expect(page.getByTestId('explorer-folder-kapitel')).toBeVisible()
  await expect(page.getByTestId('explorer-file-kapitel/aufgabe.klonk')).toHaveCount(0)
  await page.getByTestId('explorer-folder-kapitel').click()
  await expect(page.getByTestId('explorer-file-kapitel/aufgabe.klonk')).toBeVisible()
  await expect(page.getByTestId('explorer-breadcrumbs')).toContainText('kapitel')
  await page.screenshot({ path: 'test-results/explorer-folder.png' })

  // Ordner löschen
  await page.getByTestId('explorer-breadcrumbs').getByRole('button', { name: 'Projekt' }).click()
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: 'Aktionen für kapitel' }).click()
  await page.getByRole('menuitem', { name: 'Löschen' }).click()
  await expect(page.getByTestId('explorer-folder-kapitel')).toHaveCount(0)
})

test('Neues Java-Projekt: Sprache, Startdatei in src/, Package aus dem Ordner', async ({ page }) => {
  await openIde(page)
  await page.evaluate(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('klonk-projects', { create: true })
    await root.removeEntry('JavaProjekt', { recursive: true }).catch(() => {})
  })
  await page.getByTestId('new-browser-project').click()
  await page.getByTestId('project-dialog-name').fill('JavaProjekt')
  await page.getByTestId('project-dialog-language').click()
  await page.getByRole('option', { name: 'Java', exact: true }).click()
  await page.getByTestId('project-dialog-submit').click()
  await expect(page.getByTestId('project-language')).toHaveText('Java')
  await expect(page.getByTestId('file-src/Main.java')).toBeVisible()
  await expect(page.getByTestId('code-editor')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
  expect(await readProjectFile(page, 'JavaProjekt', 'klonk.json')).toContain('"java"')

  // „Neue Datei“ bietet nur Java (plus Welt und Ordner)
  await page.getByTestId('new-file').click()
  await expect(page.getByRole('menuitem', { name: 'Python', exact: true })).toHaveCount(0)
  await page.getByRole('menuitem', { name: 'Ordner' }).click()
  await page.getByTestId('project-dialog-name').fill('src/de/tools')
  await page.getByTestId('project-dialog-submit').click()
  await page.getByTestId('folder-actions-src/de/tools').click()
  await page.getByRole('menuitem', { name: 'Neue Datei' }).click()
  await page.getByRole('menuitem', { name: 'Java', exact: true }).click()
  await page.getByTestId('project-dialog-name').fill('Walker')
  await page.getByTestId('project-dialog-submit').click()
  await expect(page.getByTestId('file-src/de/tools/Walker.java')).toBeVisible()
  await expect.poll(() => readProjectFile(page, 'JavaProjekt', 'src/de/tools/Walker.java').catch(() => '')).toMatch(/^package de\.tools;[\s\S]*public class Walker/)

  // Startdatei läuft
  await page.getByTestId('file-src/Main.java').click()
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 60_000 })
})

test('Leeres Projekt öffnen ⇒ einrichten mit Startdateien; C#-Klasse im Namespace des Ordners', async ({ page }) => {
  await openIde(page)
  await seedProject(page, 'Leer', {})
  await page.reload()
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' })
  await page.getByTestId('toggle-project').click()
  await page.getByTestId('browser-project-Leer').click()
  // Dialog „Projekt einrichten“: nur die Sprache
  await expect(page.getByTestId('project-dialog-name')).toHaveCount(0)
  await page.getByTestId('project-dialog-language').click()
  await page.getByRole('option', { name: 'C#', exact: true }).click()
  await page.getByTestId('project-dialog-submit').click()
  await expect(page.getByTestId('project-language')).toHaveText('C#')
  await expect(page.getByTestId('file-Program.cs')).toBeVisible()
  await expect(page.getByTestId('file-welt.klonkworld.json')).toBeVisible()

  await page.getByTestId('new-file').click()
  await page.getByRole('menuitem', { name: 'Ordner' }).click()
  await page.getByTestId('project-dialog-name').fill('Werkzeuge')
  await page.getByTestId('project-dialog-submit').click()
  await page.getByTestId('folder-actions-Werkzeuge').click()
  await page.getByRole('menuitem', { name: 'Neue Datei' }).click()
  await page.getByRole('menuitem', { name: 'C#', exact: true }).click()
  await page.getByTestId('project-dialog-name').fill('Laufen')
  await page.getByTestId('project-dialog-submit').click()
  await expect.poll(() => readProjectFile(page, 'Leer', 'Werkzeuge/Laufen.cs').catch(() => '')).toMatch(/namespace Werkzeuge;[\s\S]*public static class Laufen/)
})

test('TypeScript: Projektdatei ab dem Projektordner importieren, ohne falsche Fehler im Editor', async ({ page }) => {
  await openIde(page)
  await seedProject(page, 'TsImport', {
    'klonk.json': '{ "language": "typescript" }',
    'main.ts': 'import { zwei } from "/src/Werkzeuge/Laufen.ts"\nimport { Klonk } from "klonk"\nconst k = new Klonk()\nzwei(k)\nconsole.log(k.positionX())\n',
    'src/Werkzeuge/Laufen.ts': 'import type { Klonk } from "klonk"\nexport function zwei(k: Klonk) {\n  k.step()\n  k.step()\n}\n',
    'welt.klonkworld.json': JSON.stringify(WORLD),
  })
  await page.reload()
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' })
  await page.getByTestId('toggle-project').click()
  await page.getByTestId('browser-project-TsImport').click()
  await page.getByTestId('file-main.ts').click()
  await expect(page.getByTestId('code-editor')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
  // Kurz nach dem Öffnen kann die erste Prüfung noch ohne die anderen Dateien laufen – dann muss die Markierung verschwinden
  await page.waitForTimeout(1500)
  await expect(page.locator('.squiggly-error')).toHaveCount(0, { timeout: 15_000 })
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


test('Rechtsklick-Menüs: Neues anlegen, Packages (Java, Python) und Namespaces (C#)', async ({ page }) => {
  await openIde(page)
  await seedProject(page, 'Kontext', {
    'klonk.json': '{ "language": "java" }',
    'src/Main.java': 'import klonk.Klonk;\n\npublic class Main {\n    public static void main(String[] args) {\n        new Klonk().step();\n    }\n}\n',
    'welt.klonkworld.json': JSON.stringify(WORLD),
  })
  await page.reload()
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' })
  await page.getByTestId('toggle-project').click()
  await page.getByTestId('browser-project-Kontext').click()

  // Freie Fläche: Java-Package ⇒ Ordner unter src/
  await page.getByTestId('file-tree').click({ button: 'right', position: { x: 60, y: 140 } })
  await page.getByRole('menuitem', { name: 'Neues Java-Package' }).click()
  await page.getByTestId('project-dialog-name').fill('spiel.figuren')
  await page.getByTestId('project-dialog-submit').click()
  await expect(page.getByTestId('folder-src/spiel/figuren')).toBeVisible()

  // Rechtsklick auf das Package ⇒ Neue Datei ⇒ Java: Klasse mit passendem package
  await page.getByTestId('folder-src/spiel/figuren').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Neue Datei' }).click()
  await page.getByRole('menuitem', { name: 'Java', exact: true }).click()
  await page.getByTestId('project-dialog-name').fill('Held')
  await page.getByTestId('project-dialog-submit').click()
  await expect(page.getByTestId('file-src/spiel/figuren/Held.java')).toBeVisible()
  await expect.poll(() => readProjectFile(page, 'Kontext', 'src/spiel/figuren/Held.java').catch(() => '')).toContain('package spiel.figuren;')

  // Rechtsklick auf eine Datei: Umbenennen, daneben „Neuer Ordner“ im selben Ordner
  await page.getByTestId('file-src/spiel/figuren/Held.java').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Neuer Ordner' }).click()
  await page.getByTestId('project-dialog-name').fill('extra')
  await page.getByTestId('project-dialog-submit').click()
  await expect(page.getByTestId('folder-src/spiel/figuren/extra')).toBeVisible()
  await page.getByTestId('file-src/Main.java').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Umbenennen' }).click()
  await expect(page.getByTestId('project-dialog-name')).toHaveValue('src/Main.java')
  await page.keyboard.press('Escape')

  // Python: Package mit __init__.py je Ebene
  await seedProject(page, 'KontextPy', { 'klonk.json': '{ "language": "python" }', 'main.py': 'print(1)\n' })
  await page.getByTestId('close-project').click()
  await page.getByTestId('browser-project-KontextPy').click()
  await page.getByTestId('file-tree').click({ button: 'right', position: { x: 60, y: 120 } })
  await page.getByRole('menuitem', { name: 'Neues Python-Package' }).click()
  await page.getByTestId('project-dialog-name').fill('werkzeuge.mathe')
  await page.getByTestId('project-dialog-submit').click()
  await expect(page.getByTestId('file-werkzeuge/mathe/__init__.py')).toBeVisible()
  await expect(page.getByTestId('file-werkzeuge/__init__.py')).toBeVisible()

  // C#: Namespace im Vollbild-Explorer (Rechtsklick auf die freie Fläche)
  await seedProject(page, 'KontextCs', { 'klonk.json': '{ "language": "csharp" }', 'src/Program.cs': 'using klonk;\nnew Klonk().Step();\n' })
  await page.getByTestId('close-project').click()
  await page.getByTestId('browser-project-KontextCs').click()
  await page.getByTestId('open-explorer').click()
  await page.getByTestId('explorer-area').click({ button: 'right', position: { x: 300, y: 300 } })
  await page.getByRole('menuitem', { name: 'Neuer C#-Namespace' }).click()
  await page.getByTestId('project-dialog-name').fill('Spiel.Werkzeuge')
  await page.getByTestId('project-dialog-submit').click()
  await expect(page.getByTestId('explorer-folder-src')).toBeVisible()
  await page.getByTestId('explorer-folder-src').click()
  await page.getByTestId('explorer-folder-src/Spiel').click()
  await page.getByTestId('explorer-folder-src/Spiel/Werkzeuge').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Neue Datei' }).click()
  await page.getByRole('menuitem', { name: 'C#', exact: true }).click()
  await page.getByTestId('project-dialog-name').fill('Helfer')
  await page.getByTestId('project-dialog-submit').click()
  await expect.poll(() => readProjectFile(page, 'KontextCs', 'src/Spiel/Werkzeuge/Helfer.cs').catch(() => '')).toContain('namespace Spiel.Werkzeuge;')
})
