import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { APP_URL } from '../playwright.config'
import { gotoHydrated, loginWithPassword } from './utils'

// Datenbanken im Browser: SQLite und PostgreSQL (PGlite) als Projektdateien, SQL-Konsole, Welt als Datenbank,
// Zugriff aus Programmen (Python, JavaScript), Export/Import von SQLite-Dateien.
test.use({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })
test.describe.configure({ mode: 'serial' })

const WORLD = { version: 1, size: { width: 5, depth: 5, height: 3 }, cells: [], characters: [{ id: 'Klonk', model: 'male', x: 0, z: 0, direction: 'south' }] }

/** Browser-Projekt im OPFS anlegen und in der IDE öffnen */
async function openProject(page: Page, name: string, files: Record<string, string>) {
  await gotoHydrated(page, `${APP_URL}/`)
  await page.evaluate(async ({ name, files }) => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('klonk-projects', { create: true })
    await root.removeEntry(name, { recursive: true }).catch(() => {})
    const dir = await root.getDirectoryHandle(name, { create: true })
    for (const [path, text] of Object.entries(files)) {
      const w = await (await dir.getFileHandle(path, { create: true })).createWritable()
      await w.write(text)
      await w.close()
    }
  }, { name, files })
  await page.reload()
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' })
  await page.getByTestId('toggle-project').click()
  await page.getByTestId(`browser-project-${name}`).click()
  await expect(page.getByTestId('project-name')).toHaveText(name)
}

/** Datei aus dem OPFS lesen (fehlt sie gerade – z. B. während des Schreibens –, leer, damit expect.poll weiter wartet) */
const readFile = (page: Page, project: string, path: string) => page.evaluate(async ({ project, path }) => {
  const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('klonk-projects')
  const file = await (await (await root.getDirectoryHandle(project)).getFileHandle(path)).getFile()
  return file.text()
}, { project, path }).catch(() => '')

async function newDatabase(page: Page, item: string, name: string) {
  await page.getByTestId('new-file').click()
  await page.getByRole('menuitem', { name: item }).click()
  await page.getByTestId('project-dialog-name').fill(name)
  await page.getByTestId('project-dialog-submit').click()
  await expect(page.getByTestId('database-editor')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(180_000)
  await loginWithPassword(page, `${APP_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
})

test('SQLite: Datenbank anlegen, abfragen, Welt per SQL ändern, aus Python nutzen', async ({ page }) => {
  await openProject(page, 'Datenbanken', {
    'klonk.json': '{ "language": "python" }',
    'welt.klonkworld.json': JSON.stringify(WORLD),
    'main.py': 'from klonk import Database\ndb = Database.open("schule")\nfor s in db.query("SELECT vorname FROM schueler WHERE klasse_id = ? ORDER BY id", (1,)):\n    print(s["vorname"])\ndb.execute("INSERT INTO schueler (id, vorname, klasse_id) VALUES (?, ?, ?)", (5, "Tom", 2))\nprint(db.query_one("SELECT count(*) AS n FROM schueler")["n"])\n',
    'welt.sql': 'UPDATE figuren SET richtung = \'osten\';\nINSERT INTO ziegel VALUES (3, 1, 1, \'blau\'), (3, 1, 2, \'gelb\');\nSELECT x, y, ebene, farbe FROM ziegel ORDER BY ebene;\n',
  })

  // Neue Datenbank mit Beispieltabellen; Tabelle anklicken zeigt ihre Zeilen
  await newDatabase(page, 'Datenbank (SQLite)', 'schule')
  await expect(page.getByTestId('file-schule.sqlite.sql')).toBeVisible()
  await expect(page.getByTestId('database-table-klassen')).toContainText('2')
  await page.getByTestId('database-table-schueler').getByRole('button').click()
  await expect(page.getByTestId('sql-result')).toContainText('3 Zeilen')
  await expect(page.getByTestId('sql-result')).toContainText('Ali')

  // Eigene Anweisung in der Konsole (Strg+Enter), Fehler mit Zeile
  const editor = page.getByTestId('sql-console').locator('.monaco-editor .view-lines')
  await editor.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('DELETE FROM schueler WHERE vorname = \'Ali\';')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+Enter')
  await expect(page.getByTestId('sql-changes')).toHaveText(/eine Zeile geändert/)
  await expect(page.getByTestId('database-table-schueler')).toContainText('2')
  await editor.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('SELECT nix FROM schueler')
  await page.keyboard.press('Escape')
  await page.getByTestId('sql-run').click()
  await expect(page.getByTestId('sql-error')).toContainText('no such column: nix')
  // Gespeichert wird als SQL-Text im Projekt
  await expect.poll(() => readFile(page, 'Datenbanken', 'schule.sqlite.sql')).toContain('INSERT INTO "schueler" VALUES(2,\'Ben\',1);')
  expect(await readFile(page, 'Datenbanken', 'schule.sqlite.sql')).not.toContain('Ali')

  // Welt als Datenbank: Abfrage-Datei, Ziel „Welt (SQLite)“, Änderungen erscheinen in der Welt
  await page.getByTestId('file-welt.sql').click()
  await page.getByTestId('sql-target').click()
  await page.getByRole('option', { name: 'Welt (SQLite)' }).click()
  await page.getByTestId('run').click()
  await expect(page.getByTestId('sql-result').last()).toContainText('blau')
  await expect(page.getByTestId('sql-world-changed')).toBeVisible()
  await page.getByTestId('sql-keep-world').click()
  await expect.poll(async () => JSON.parse(await readFile(page, 'Datenbanken', 'welt.klonkworld.json') || '{}')).toMatchObject({
    cells: [{ x: 2, z: 0, bricks: ['blue', 'yellow'] }],
    characters: [{ id: 'Klonk', direction: 'east' }],
  })
  // Ungültige Werte fängt die Datenbank ab
  await page.getByTestId('sql-console').locator('.monaco-editor .view-lines').click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('UPDATE ziegel SET farbe = \'pink\'')
  await page.keyboard.press('Escape')
  await page.getByTestId('sql-run').click()
  await expect(page.getByTestId('sql-error')).toContainText('CHECK')

  // Python greift auf dieselbe Datenbank zu; die Änderung landet in der Datei
  await page.getByTestId('file-main.py').click()
  await page.getByTestId('run').click()
  await expect(page.getByTestId('run-state')).toHaveAttribute('data-state', 'done', { timeout: 90_000 })
  await expect(page.getByTestId('output')).toHaveText('Mia\nBen\n3')
  await expect.poll(() => readFile(page, 'Datenbanken', 'schule.sqlite.sql')).toContain('\'Tom\'')

  // Als SQLite-Datei herunterladen und wieder importieren
  await page.getByTestId('file-schule.sqlite.sql').click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('database-export').click()])
  expect(download.suggestedFilename()).toBe('schule.db')
  const bytes = readFileSync(await download.path())
  expect(bytes.subarray(0, 15).toString()).toBe('SQLite format 3')
  await page.getByTestId('new-file').click()
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: 'SQLite-Datei importieren …' }).click()])
  await chooser.setFiles({ name: 'kopie.db', mimeType: 'application/vnd.sqlite3', buffer: bytes })
  await expect(page.getByTestId('file-kopie.sqlite.sql')).toBeVisible()
  expect(await readFile(page, 'Datenbanken', 'kopie.sqlite.sql')).toContain('\'Tom\'')
})

test('PostgreSQL (PGlite): Datenbank anlegen und aus JavaScript nutzen', async ({ page }) => {
  await openProject(page, 'Postgres', {
    'klonk.json': '{ "language": "javascript" }',
    'welt.klonkworld.json': JSON.stringify(WORLD),
    'main.js': 'import { Database } from \'klonk\'\nconst db = Database.open(\'firma\')\nconsole.log(db.engine, db.tables().join(\',\'))\ndb.execute(\'INSERT INTO schueler (id, vorname, klasse_id) VALUES ($1, $2, $3)\', [7, \'Lea\', 2])\nconst rows = db.query(\'SELECT vorname FROM schueler WHERE klasse_id = $1 ORDER BY id\', [2])\nconsole.log(rows.map(r => r.vorname).join(\',\'))\ntry { db.query(\'SELEC 1\') } catch (e) { console.log(e.name) }\n',
  })
  await newDatabase(page, 'Datenbank (PostgreSQL)', 'firma')
  await expect(page.getByTestId('file-firma.postgres.sql')).toBeVisible()
  await expect(page.getByTestId('database-table-schueler')).toContainText('3', { timeout: 60_000 })

  await page.getByTestId('file-main.js').click()
  await page.getByTestId('run').click()
  await expect(page.getByTestId('run-state')).toHaveAttribute('data-state', 'done', { timeout: 60_000 })
  await expect(page.getByTestId('output')).toHaveText('postgres klassen,schueler\nAli,Lea\nDatabaseError')
  // pg_dump sichert mit INSERTs (ohne COPY), damit die Datei wieder einlesbar ist
  await expect.poll(() => readFile(page, 'Postgres', 'firma.postgres.sql'), { timeout: 30_000 }).toContain('INSERT INTO public.schueler VALUES (7, \'Lea\', 2);')
})
