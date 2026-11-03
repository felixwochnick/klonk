import { expect, test, type Browser, type Page } from '@playwright/test'
import { ADMIN_URL, APP_URL } from '../playwright.config'
import { browserFetch, changePassword, gotoHydrated, loginWithPassword } from './utils'

// Klonk Cloud (selbst gehostet immer frei): Gruppe mit gemeinsamem Ordner, Aufgabe + Abgabe, Sync zwischen Geräten.
// Jeder Kontext hat sein eigenes OPFS – wie ein eigenes Gerät.
test.use({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })
test.describe.configure({ mode: 'serial' })

async function device(browser: Browser, baseUrl: string, identifier: string, password: string) {
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()
  await loginWithPassword(page, `${baseUrl}/login`, identifier, password)
  return page
}

/** Zum Explorer, ohne die Seite neu zu laden (das geöffnete Projekt bleibt offen) */
async function toExplorer(page: Page) {
  await page.getByRole('link', { name: 'Projekte' }).first().click()
  await expect(page.getByTestId('explorer')).toBeVisible()
}

const synced = (page: Page) => expect(page.getByTestId('cloud-sync')).toHaveText('synchronisiert', { timeout: 20_000 })

async function newEntry(page: Page, item: string, name: string) {
  await page.getByTestId('explorer-new-file').click()
  await page.getByRole('menuitem', { name: item }).click()
  await page.getByTestId('project-dialog-name').fill(name)
  await page.getByTestId('project-dialog-submit').click()
}

test('Gruppe mit gemeinsamem Ordner: Aufgabe verteilen, bearbeiten und abgeben', async ({ browser }) => {
  test.setTimeout(180_000)
  const admin = await device(browser, ADMIN_URL, 'admin@gym-muster.de', 'admin-passwort')
  const created = await browserFetch(admin, `${ADMIN_URL}/api/admin/users`, { method: 'POST', body: { username: 'mia', displayName: 'Mia Muster', role: 'member', password: 'start-mia' } })
  expect(created.ok).toBe(true)
  await admin.context().close()

  // Lehrkraft legt die Gruppe an (wird Gruppenleitung) und nimmt Mia auf
  const teacherAdmin = await device(browser, ADMIN_URL, 'lena@gym-muster.de', 'lena-geheim')
  await gotoHydrated(teacherAdmin, `${ADMIN_URL}/groups`)
  await teacherAdmin.getByTestId('group-new-name').fill('7a')
  await teacherAdmin.getByTestId('group-create').click()
  const detail = teacherAdmin.getByTestId('group-detail')
  await expect(detail.getByTestId('group-member-lena')).toContainText('Gruppenleitung')
  await expect(detail.getByRole('switch', { name: 'Mitglieder dürfen im gemeinsamen Ordner schreiben' })).not.toBeChecked()
  await detail.getByTestId('group-add-members').click()
  await teacherAdmin.getByRole('option', { name: 'Mia Muster (mia)' }).click()
  await teacherAdmin.keyboard.press('Escape')
  await detail.getByTestId('group-add').click()
  await expect(detail.getByTestId('group-member-mia')).toBeVisible()
  await teacherAdmin.context().close()

  // Lehrkraft füllt den gemeinsamen Ordner und verteilt eine Aufgabe
  const teacher = await device(browser, APP_URL, 'lena@gym-muster.de', 'lena-geheim')
  await gotoHydrated(teacher, `${APP_URL}/projects`)
  await teacher.getByTestId('cloud-group-7a').click()
  await expect(teacher.getByTestId('explorer-project-name')).toHaveText('7a')
  await newEntry(teacher, 'Ordner', 'Aufgabe 1')
  await teacher.getByTestId('explorer-folder-Aufgabe 1').click()
  await newEntry(teacher, 'Klonk-Script', 'start')
  await expect(teacher.getByTestId('explorer-file-Aufgabe 1/start.klonk')).toBeVisible()
  await synced(teacher)
  await teacher.getByTestId('explorer-breadcrumbs').getByRole('button', { name: 'Projekt' }).click()
  await teacher.getByRole('button', { name: 'Aktionen für Aufgabe 1' }).click()
  await teacher.getByRole('menuitem', { name: 'Als Aufgabe verteilen' }).click()
  await expect(teacher.getByTestId('cloud-assignment-Aufgabe 1')).toBeVisible()

  // Schülerin: gemeinsamer Ordner nur lesen, Aufgabe als eigene Kopie bearbeiten
  const student = await device(browser, APP_URL, 'mia@gym-muster.de', 'start-mia')
  await changePassword(student, 'start-mia', 'mia-geheim')
  await gotoHydrated(student, `${APP_URL}/projects`)
  await student.getByTestId('cloud-group-7a').click()
  await expect(student.getByTestId('cloud-read-only')).toBeVisible()
  await expect(student.getByTestId('explorer-new-file')).toHaveCount(0)
  await expect(student.getByTestId('cloud-assignment-Aufgabe 1')).toBeVisible()
  // Schreiben im gemeinsamen Ordner verweigert auch der Server
  const groupProject = await student.evaluate(() => fetch('/api/cloud').then(r => r.json()).then(s => s.groups[0].projectId as string))
  const denied = await browserFetch(student, `/api/cloud/projects/${groupProject}/files`, { method: 'PUT', body: { path: 'hack.klonk', content: '', baseRevision: 0 } })
  expect(denied.status).toBe(403)

  await student.getByRole('button', { name: 'Aktionen für Aufgabe 1' }).click()
  await student.getByRole('menuitem', { name: 'Aufgabe bearbeiten' }).click()
  await expect(student.getByTestId('explorer-project-name')).toHaveText('Aufgabe 1')
  await expect(student.getByTestId('cloud-read-only')).toHaveCount(0)
  await student.getByTestId('explorer-file-start.klonk').click()
  const editor = student.getByTestId('code-editor')
  await expect(editor).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
  await student.locator('.monaco-editor .view-lines').click()
  await student.keyboard.press('Control+End')
  await student.keyboard.type('\n# Lösung von Mia')
  await toExplorer(student)
  await synced(student)

  // Lehrkraft sieht die Abgabe (nur lesen)
  await teacher.getByRole('button', { name: 'Aktionen für Aufgabe 1' }).click()
  await teacher.getByRole('menuitem', { name: 'Abgaben ansehen' }).click()
  const submissions = teacher.getByTestId('cloud-submissions')
  await expect(submissions).toContainText('Mia Muster')
  await submissions.getByRole('button', { name: 'Öffnen' }).click()
  await expect(teacher.getByTestId('explorer-project-name')).toHaveText('Mia Muster – Aufgabe 1')
  await expect(teacher.getByTestId('cloud-read-only')).toBeVisible()
  await teacher.getByTestId('explorer-file-start.klonk').click()
  await expect(teacher.locator('.monaco-editor .view-lines')).toContainText('# Lösung von Mia', { timeout: 20_000 })

  await student.context().close()
  await teacher.context().close()
})

test('Eigenes Cloud-Projekt auf zwei Geräten, lokales Projekt hochladen', async ({ browser }) => {
  test.setTimeout(120_000)
  const laptop = await device(browser, APP_URL, 'mia@gym-muster.de', 'mia-geheim')
  await gotoHydrated(laptop, `${APP_URL}/projects`)
  await laptop.getByTestId('cloud-new-project').click()
  await laptop.getByTestId('project-dialog-name').fill('Robo')
  await laptop.getByTestId('project-dialog-submit').click()
  await expect(laptop.getByTestId('explorer-project-name')).toHaveText('Robo')
  await expect(laptop.getByTestId('explorer-file-welt.klonkworld.json')).toBeVisible()
  await synced(laptop)

  // Zweites Gerät: gleiche Dateien, neue Ordner kommen auf dem ersten an
  const tablet = await device(browser, APP_URL, 'mia@gym-muster.de', 'mia-geheim')
  await gotoHydrated(tablet, `${APP_URL}/projects`)
  await tablet.getByTestId('cloud-project-Robo').click()
  await expect(tablet.getByTestId('explorer-file-welt.klonkworld.json')).toBeVisible()
  await newEntry(tablet, 'Ordner', 'Vom Tablet')
  await synced(tablet)
  await expect(laptop.getByTestId('explorer-folder-Vom Tablet')).toBeVisible({ timeout: 30_000 })

  // Browser-Projekt in die Cloud hochladen
  await laptop.getByTestId('explorer-new-project').click()
  await laptop.getByTestId('project-dialog-name').fill('Lokal')
  await laptop.getByTestId('project-dialog-submit').click()
  await expect(laptop.getByTestId('explorer-project-name')).toHaveText('Lokal')
  await laptop.getByTestId('cloud-upload').click()
  await laptop.getByTestId('project-dialog-name').fill('Hochgeladen')
  await laptop.getByTestId('project-dialog-submit').click()
  await expect(laptop.getByTestId('explorer-project-name')).toHaveText('Hochgeladen')
  await expect(laptop.getByTestId('cloud-project-Hochgeladen')).toBeVisible()
  await expect(laptop.getByTestId('explorer-file-welt.klonkworld.json')).toBeVisible()
  await expect(laptop.getByTestId('cloud-quota')).toContainText('von 50 MB belegt')

  await laptop.context().close()
  await tablet.context().close()
})
