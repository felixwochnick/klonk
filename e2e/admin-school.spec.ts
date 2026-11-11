import { expect, test, type Page } from '@playwright/test'
import { strToU8, zipSync } from 'fflate'
import { ADMIN_URL, APP_URL } from '../playwright.config'
import { gotoHydrated, loginWithPassword, waitForPage } from './utils'

// Schulstruktur (Bundesland, Schulform ⇒ Jahrgangsstufen), Kontenimport aus Listen und Gruppenzuordnung per Liste.
// Baut auf admin-accounts.spec.ts auf (Gymnasium Musterstadt, Ada Admin, Lena Lehrkraft) und räumt am Ende auf.
test.use({ locale: 'de-DE' })

async function choose(page: Page, testId: string, option: string) {
  await page.getByTestId(testId).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

/** Minimale Excel-Datei (erstes Blatt, gemeinsame Zeichenketten) */
function xlsx(rows: string[][]) {
  const strings: string[] = []
  const index = (s: string) => (strings.includes(s) ? strings.indexOf(s) : strings.push(s) - 1)
  const sheetRows = rows.map((row, r) => `<row r="${r + 1}">${row.map((cell, c) =>
    `<c r="${String.fromCharCode(65 + c)}${r + 1}" t="s"><v>${index(cell)}</v></c>`).join('')}</row>`).join('')
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
  return Buffer.from(zipSync({
    'xl/workbook.xml': strToU8(`<workbook ${ns} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Liste" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet ${ns}><sheetData>${sheetRows}</sheetData></worksheet>`),
    'xl/sharedStrings.xml': strToU8(`<sst ${ns}>${strings.map(s => `<si><t>${s}</t></si>`).join('')}</sst>`),
  }))
}

/** Minimale OpenDocument-Tabelle (mit wiederholten leeren Zellen wie aus LibreOffice) */
function ods(rows: string[][]) {
  const body = rows.map(row => `<table:table-row>${row.map(cell => `<table:table-cell office:value-type="string"><text:p>${cell}</text:p></table:table-cell>`).join('')}<table:table-cell table:number-columns-repeated="1020"/></table:table-row>`).join('')
  return Buffer.from(zipSync({
    'mimetype': strToU8('application/vnd.oasis.opendocument.spreadsheet'),
    'content.xml': strToU8(`<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet><table:table table:name="Tabelle1">${body}<table:table-row table:number-rows-repeated="1048570"><table:table-cell table:number-columns-repeated="1024"/></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>`),
  }))
}

test('Schulform ordnet Gruppen nach Jahrgangsstufen; Konten per Liste anlegen und Gruppen zuordnen', async ({ page }) => {
  await loginWithPassword(page, `${ADMIN_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')

  // 1. Bundesland und Schulform
  await gotoHydrated(page, `${ADMIN_URL}/groups`)
  await expect(page.getByTestId('groups-structure-hint')).toBeVisible()
  await gotoHydrated(page, `${ADMIN_URL}/organization`)
  await choose(page, 'organization-state', 'Bayern')
  await choose(page, 'organization-school-form', 'Gymnasium (G9) (5–13)')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible()

  // 2. Gruppen nach Jahrgangsstufen: „5a“ landet von selbst in Stufe 5, die AG über „+“ in den Zusatzkursen
  await gotoHydrated(page, `${ADMIN_URL}/groups`)
  await expect(page.getByTestId('groups-structure-hint')).toHaveCount(0)
  await expect(page.getByTestId('group-section-13')).toBeVisible()
  await page.getByTestId('group-new-name').fill('5a')
  await page.getByTestId('group-create').click()
  await expect(page.getByTestId('group-section-5').getByTestId('group-5a')).toBeVisible()
  await page.getByRole('button', { name: 'Neue Gruppe in Zusatzkurse' }).click()
  await page.getByTestId('group-new-name').fill('Informatik-AG')
  await page.getByTestId('group-create').click()
  await expect(page.getByTestId('group-section-courses').getByTestId('group-Informatik-AG')).toBeVisible()
  // Einordnung nachträglich ändern
  await page.getByTestId('group-5a').click()
  await choose(page, 'group-level', 'Jahrgangsstufe 6')
  await expect(page.getByTestId('group-section-6').getByTestId('group-5a')).toBeVisible()
  await choose(page, 'group-level', 'Jahrgangsstufe 5')
  await expect(page.getByTestId('group-section-5').getByTestId('group-5a')).toBeVisible()

  // 3. Konten aus einer CSV (Windows-1252 wie aus Excel) – doppelte Namen werden durchnummeriert
  await gotoHydrated(page, `${ADMIN_URL}/users`)
  await page.getByTestId('users-import').click()
  const dialog = page.getByRole('dialog')
  // ODS wird gelesen (Vorschau), aber nicht importiert
  await dialog.getByTestId('import-file').setInputFiles({ name: 'liste.ods', mimeType: 'application/vnd.oasis.opendocument.spreadsheet', buffer: ods([['Name', 'Klasse'], ['Mustermann, Erika', '6b']]) })
  await expect(dialog.getByTestId('import-preview')).toContainText('erika.mustermann')
  const csv = Buffer.from('Vorname;Nachname;Klasse\r\nMax;Müller;5a\r\nJürgen;Groß;6b\r\nMax;Müller;5a\r\n', 'latin1')
  await dialog.getByTestId('import-file').setInputFiles({ name: 'klassen.csv', mimeType: 'text/csv', buffer: csv })
  const preview = dialog.getByTestId('import-preview')
  await expect(preview).toContainText('max.mueller')
  await expect(preview).toContainText('juergen.gross')
  await expect(preview).toContainText('max.mueller2')
  await choose(page, 'import-separator', '„_“')
  await expect(preview).toContainText('juergen_gross')
  await choose(page, 'import-separator', '„.“')
  await choose(page, 'import-password-mode', 'Für alle gleich')
  await dialog.getByTestId('import-same-password').fill('kurz')
  await expect(preview).toContainText('Passwort zu kurz')
  await dialog.getByTestId('import-same-password').fill('Beispiel1')
  await expect(dialog.getByText('Neu: 6b')).toBeVisible()
  await dialog.getByTestId('import-run').click()
  await expect(dialog.getByTestId('import-result')).toContainText('3 Konten angelegt')
  await expect(dialog.getByTestId('import-result')).toContainText('Neue Gruppen: 6b')
  const download = page.waitForEvent('download')
  await dialog.getByTestId('import-download').click()
  const file = await (await download).createReadStream()
  const text = await new Promise<string>((resolve) => {
    let data = ''
    file.on('data', (chunk: Buffer) => (data += chunk.toString('utf8')))
    file.on('end', () => resolve(data))
  })
  expect(text).toContain('Jürgen Groß;juergen.gross@gym-muster.de;Beispiel1;6b')
  await dialog.getByTestId('import-close').click()
  await expect(page.getByRole('button', { name: 'Aktionen für Jürgen Groß' })).toBeVisible()

  // Erneuter Import derselben Liste legt nichts doppelt an
  await page.getByTestId('users-import').click()
  await dialog.getByTestId('import-file').setInputFiles({ name: 'klassen.csv', mimeType: 'text/csv', buffer: csv })
  await expect(dialog.getByRole('heading', { name: /Vorschau: 0 von 3/ })).toBeVisible()
  await page.keyboard.press('Escape')

  // Neue Gruppe 6b steht in Stufe 6, Max ist Mitglied von 5a
  await gotoHydrated(page, `${ADMIN_URL}/groups`)
  await expect(page.getByTestId('group-section-6').getByTestId('group-6b')).toBeVisible()
  await page.getByTestId('group-5a').click()
  await expect(page.getByTestId('group-member-max.mueller')).toBeVisible()
  await expect(page.getByTestId('group-member-max.mueller2')).toBeVisible()

  // 4. Vorhandene Konten per Excel-Liste der Informatik-AG zuordnen (Benutzername mit oder ohne Domain, Name)
  await page.getByTestId('groups-import').click()
  await dialog.getByTestId('import-file').setInputFiles({
    name: 'ag.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: xlsx([['Benutzername', 'Name', 'Gruppe'], ['lena@gym-muster.de', '', 'Informatik-AG'], ['', 'Jürgen Groß', 'Informatik-AG'], ['niemand', '', 'Informatik-AG']]),
  })
  await expect(dialog.getByTestId('import-preview')).toContainText('Kein Konto')
  await expect(dialog.getByRole('heading', { name: '2 von 3 Zeilen zugeordnet' })).toBeVisible()
  await dialog.getByTestId('import-run').click()
  await expect(dialog.getByTestId('import-result')).toContainText('2 Zuordnungen in 1 Gruppen')
  await dialog.getByTestId('import-close').click()
  await page.getByTestId('group-Informatik-AG').click()
  await expect(page.getByTestId('group-member-lena')).toBeVisible()
  await expect(page.getByTestId('group-member-juergen.gross')).toBeVisible()

  // 5. Importiertes Konto meldet sich mit dem Startpasswort an und muss es ändern
  const student = await page.context().browser()!.newContext({ locale: 'de-DE' }).then(c => c.newPage())
  await gotoHydrated(student, `${APP_URL}/login`)
  await student.getByLabel('Benutzername').fill('max.mueller@gym-muster.de')
  await student.getByRole('button', { name: 'Weiter' }).click()
  await student.getByLabel('Passwort').fill('Beispiel1')
  await student.getByRole('button', { name: 'Anmelden', exact: true }).click()
  await waitForPage(student, url => url.pathname === '/change-password')

  // Aufräumen: importierte Konten, Gruppen und Schulform (folgende Tests erwarten den Ausgangszustand)
  await page.evaluate(async () => {
    const users: { id: string, username: string }[] = await fetch('/api/admin/users').then(r => r.json())
    for (const u of users.filter(u => ['max.mueller', 'max.mueller2', 'juergen.gross'].includes(u.username)))
      await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' })
    const groups: { id: string, name: string }[] = await fetch('/api/admin/groups').then(r => r.json())
    for (const g of groups.filter(g => ['5a', '6b', 'Informatik-AG'].includes(g.name)))
      await fetch(`/api/admin/groups/${g.id}`, { method: 'DELETE' })
    await fetch('/api/admin/organization', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: null, schoolForm: null }) })
  })
})
