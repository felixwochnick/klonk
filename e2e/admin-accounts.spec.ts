import { expect, test, type Page } from '@playwright/test'
import { ADMIN_URL, APP_URL } from '../playwright.config'
import { changePassword, gotoHydrated, loginWithPassword, waitForPage } from './utils'

test.use({ locale: 'de-DE' })

const login = (page: Page, baseUrl: string, identifier: string, password: string) =>
  loginWithPassword(page, `${baseUrl}/login`, identifier, password)

async function createAccount(page: Page, data: { name: string, username: string, role: string, password: string }) {
  await page.getByRole('button', { name: 'Konto anlegen' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name', { exact: true }).fill(data.name)
  await dialog.getByLabel('Benutzername').fill(data.username)
  await dialog.getByRole('combobox').click()
  await page.getByRole('option', { name: data.role }).click()
  await dialog.getByLabel('Startpasswort').fill(data.password)
  await dialog.getByRole('button', { name: 'Konto anlegen' }).click()
  await expect(page.getByRole('button', { name: `Aktionen für ${data.name}` })).toBeVisible()
}

test('Einrichtung, Kontenverwaltung und Passwort-Reset durch Lehrkraft', async ({ browser }) => {
  // Erster Test des Laufs: die Dev-Server übersetzen die Seiten erst beim ersten Aufruf
  test.setTimeout(90_000)
  // 1. Ersteinrichtung
  const admin = await browser.newPage()
  await gotoHydrated(admin, ADMIN_URL)
  await expect(admin).toHaveURL(/\/setup$/)
  await admin.getByLabel('Name', { exact: true }).first().fill('Gymnasium Musterstadt')
  await admin.getByLabel('Domain').fill('gym-muster.de')
  await admin.getByLabel('Name', { exact: true }).nth(1).fill('Ada Admin')
  await admin.getByLabel('Passwort').fill('admin-passwort')
  await admin.getByRole('button', { name: 'Einrichten' }).click()
  await expect(admin.getByRole('heading', { name: 'Gymnasium Musterstadt' })).toBeVisible()
  await expect(admin.getByTestId('count-admin')).toHaveText('1')

  // 2. Konten anlegen
  await admin.getByRole('link', { name: 'Konten', exact: true }).click()
  await createAccount(admin, { name: 'Lena Lehrkraft', username: 'lena', role: 'Lehrkraft', password: 'start-lena' })
  await createAccount(admin, { name: 'Sam Schüler', username: 'sam', role: 'Schüler:in', password: 'start-sam' })

  // 3. Lehrkraft meldet sich an, ändert ihr Startpasswort und setzt das Passwort von Sam zurück
  const teacherContext = await browser.newContext({ locale: 'de-DE' })
  const teacher = await teacherContext.newPage()
  await login(teacher, ADMIN_URL, 'lena@gym-muster.de', 'start-lena')
  await changePassword(teacher, 'start-lena', 'lena-geheim')
  await gotoHydrated(teacher, `${ADMIN_URL}/users`)
  await expect(teacher.getByRole('button', { name: 'Konto anlegen' })).toHaveCount(0)
  // Admins kann die Lehrkraft nicht zurücksetzen
  await expect(teacher.getByRole('button', { name: 'Aktionen für Ada Admin' })).toHaveCount(0)
  await teacher.getByRole('button', { name: 'Aktionen für Sam Schüler' }).click()
  await teacher.getByRole('menuitem', { name: 'Passwort zurücksetzen' }).click()
  await teacher.getByRole('dialog').getByLabel('Startpasswort').fill('reset-sam')
  await teacher.getByRole('dialog').getByRole('button', { name: 'Passwort zurücksetzen' }).click()
  await expect(teacher.getByText('Passwort zurückgesetzt', { exact: true })).toBeVisible()

  // 4. Schüler meldet sich in der App mit dem neuen Startpasswort an und muss es ändern
  const studentContext = await browser.newContext({ locale: 'de-DE' })
  const student = await studentContext.newPage()
  await gotoHydrated(student, `${APP_URL}/login`)
  await student.getByLabel('Benutzername').fill('sam@gym-muster.de')
  await student.getByRole('button', { name: 'Weiter' }).click()
  await student.getByLabel('Passwort').fill('start-sam')
  await student.getByRole('button', { name: 'Anmelden', exact: true }).click()
  await expect(student.getByText('Benutzername oder Passwort ist falsch.')).toBeVisible()
  await student.getByLabel('Passwort').fill('reset-sam')
  await student.getByRole('button', { name: 'Anmelden', exact: true }).click()
  await changePassword(student, 'reset-sam', 'sam-geheim')
  await expect(student.getByTestId('user-menu')).toHaveText(/Sam Schüler/)

  // 5. Schüler hat keinen Zugang zur Verwaltung
  await student.goto(`${ADMIN_URL}/users`)
  await expect(student).toHaveURL(/\/no-access$/)

  // 6. Gesperrtes Konto wird sofort abgemeldet
  await gotoHydrated(admin, `${ADMIN_URL}/users`)
  await admin.getByRole('button', { name: 'Aktionen für Sam Schüler' }).click()
  await admin.getByRole('menuitem', { name: 'Sperren' }).click()
  await expect(admin.getByText('Gesperrt')).toBeVisible()
  await gotoHydrated(student, APP_URL)
  await expect(student).toHaveURL(/\/login/)
})

test('Login-Methoden lassen sich speichern', async ({ page }) => {
  await login(page, ADMIN_URL, 'admin@gym-muster.de', 'admin-passwort')
  await page.getByRole('link', { name: 'Anmeldung' }).click()
  await page.getByRole('switch', { name: 'Konten mit Passwort' }).click()
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Mindestens eine Anmeldemethode muss aktiv sein.', { exact: true })).toBeVisible()

  await page.getByRole('switch', { name: 'Konten mit Passwort' }).click()
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible()
})
