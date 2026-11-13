import { expect, test, type Browser, type Page } from '@playwright/test'
import { ADMIN_URL, APP_URL } from '../playwright.config'
import { gotoHydrated, loginWithPassword } from './utils'

// Unterricht: Jahrgangsstufen der Schulform mit den eigenen Klassen, Lehrplan-Empfehlung der Lernmodule, Freigabe-Matrix.
// Baut auf learn.spec.ts auf (Gruppe 9c mit Tom, Leitung Lena; Tom hat in Modul 1 eine Aufgabe gelöst) und räumt auf.
test.use({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })

const TEACHER = ['lena@gym-muster.de', 'lena-geheim'] as const
const STUDENT = ['tom@gym-muster.de', 'tom-geheim'] as const

async function device(browser: Browser, baseUrl: string, [identifier, password]: readonly [string, string]) {
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()
  await loginWithPassword(page, `${baseUrl}/login`, identifier, password)
  return page
}

function api<T = unknown>(page: Page, url: string, method = 'GET', body?: unknown) {
  return page.evaluate(async ({ url, method, body }) => {
    const res = await fetch(url, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: res.status, body: await res.json().catch(() => null) }
  }, { url, method, body }) as Promise<{ status: number, body: T }>
}

test('Unterricht: Klassen nach Jahrgangsstufen, Lernmodule passend zum Lehrplan freigeben', async ({ browser }) => {
  test.setTimeout(120_000)
  // Schule: Bayern, Gymnasium (G9); 9c in Stufe 9, Lena legt zusätzlich 9d an (und leitet sie)
  const admin = await device(browser, ADMIN_URL, ['admin@gym-muster.de', 'admin-passwort'])
  expect((await api(admin, `${ADMIN_URL}/api/admin/organization`, 'PATCH', { state: 'BY', schoolForm: 'gymnasium9' })).status).toBe(200)
  const groups = (await api<{ id: string, name: string }[]>(admin, `${ADMIN_URL}/api/admin/groups`)).body
  const c9 = groups.find(g => g.name === '9c')!.id
  expect((await api(admin, `${ADMIN_URL}/api/admin/groups/${c9}`, 'PATCH', { level: '9' })).status).toBe(200)
  const teacherAdmin = await device(browser, ADMIN_URL, TEACHER)
  const d9 = (await api<{ id: string }>(teacherAdmin, `${ADMIN_URL}/api/admin/groups`, 'POST', { name: '9d', level: '9' })).body.id
  await teacherAdmin.context().close()

  // Übersicht: Stufen der Schulform, eigene Klassen, passende Module laut Lehrplan
  const teacher = await device(browser, APP_URL, TEACHER)
  await gotoHydrated(teacher, `${APP_URL}/learn`)
  await teacher.getByRole('link', { name: 'Unterricht' }).first().click()
  await expect(teacher.getByTestId('teaching-school')).toHaveText('Bayern · Gymnasium (G9)')
  const level9 = teacher.getByTestId('teaching-level-9')
  await expect(level9).toContainText('9c')
  await expect(level9).toContainText('9d')
  await expect(level9).toContainText('Passende Module: 2–4')
  await expect(teacher.getByTestId('teaching-level-7')).toContainText('Keine eigenen Klassen')
  await expect(teacher.getByTestId('teaching-level-7')).toContainText('Passende Module: 1–4')
  await expect(teacher.getByTestId('teaching-level-courses')).toBeVisible()
  await teacher.screenshot({ path: 'test-results/teaching-overview.png', fullPage: true })

  // Jahrgangsstufe 9: Lehrplan mit Link zur Klassenseite der Doku
  await level9.click()
  await expect(teacher.getByRole('heading', { level: 1 })).toHaveText('Jahrgangsstufe 9')
  const curriculum = teacher.getByTestId('teaching-curriculum')
  await expect(curriculum).toContainText('Wiederholung')
  await expect(curriculum.getByRole('link', { name: 'Lehrplan und Unterrichtsideen' })).toHaveAttribute('href', /\/de\/teaching\/germany\/bavaria\/gymnasium\/grade-9$/)

  // Passende Module für beide Klassen freigeben, einzelne Zellen ändern
  await expect(teacher.getByTestId('teaching-row-repeat')).toContainText('Lehrplan')
  await expect(teacher.getByTestId('teaching-row-sequence')).not.toContainText('Lehrplan')
  await teacher.getByTestId('teaching-release-recommended').click()
  for (const group of ['9c', '9d']) {
    for (const module of ['repeat', 'while', 'conditions']) await expect(teacher.getByTestId(`teaching-cell-${group}-${module}`)).toBeChecked()
    await expect(teacher.getByTestId(`teaching-cell-${group}-sequence`)).not.toBeChecked()
  }
  await expect(teacher.getByTestId('teaching-release-recommended')).toHaveCount(0)
  await teacher.getByTestId('teaching-cell-9d-while').click()
  await expect(teacher.getByTestId('teaching-cell-9d-while')).not.toBeChecked()
  // Modul 1 für 9c: Tom hat 1 von 4 Aufgaben gelöst
  await teacher.getByTestId('teaching-cell-9c-sequence').click()
  await expect(teacher.getByTestId('teaching-share-9c-sequence')).toHaveText('25 % gelöst')
  const overview = (await api<{ groups: { name: string, modules: string[], languages: Record<string, string> }[] }>(teacher, '/api/teaching')).body.groups
  expect(overview.find(g => g.name === '9c')?.modules).toEqual(['sequence', 'repeat', 'while', 'conditions'])
  expect(overview.find(g => g.name === '9d')?.modules).toEqual(['repeat', 'conditions'])
  await teacher.screenshot({ path: 'test-results/teaching-level.png' })

  // Klasse: Lernstand und Freigabe mit Lehrplan-Kennzeichnung, zurück zur Stufe
  await teacher.getByTestId('teaching-group-9c').getByRole('link', { name: 'Lernstand und Freigabe' }).click()
  await expect(teacher.getByRole('heading', { level: 1 })).toHaveText('Lernstand – 9c')
  await expect(teacher.getByTestId('learn-enable')).toContainText('Lehrplan')
  await expect(teacher.getByTestId('learn-cell-tom-sequence')).toHaveText('1/4')
  await teacher.getByRole('link', { name: 'Jahrgangsstufe 9' }).click()
  await expect(teacher.getByRole('heading', { level: 1 })).toHaveText('Jahrgangsstufe 9')
  // Alte Adresse leitet weiter
  await gotoHydrated(teacher, `${APP_URL}/learn/groups/${c9}`)
  await expect(teacher).toHaveURL(new RegExp(`/teaching/groups/${c9}$`))
  await expect(teacher.getByRole('heading', { level: 1 })).toHaveText('Lernstand – 9c')

  // Lernende sehen keinen Unterricht
  const student = await device(browser, APP_URL, STUDENT)
  await gotoHydrated(student, `${APP_URL}/learn`)
  await expect(student.getByRole('link', { name: 'Unterricht' })).toHaveCount(0)
  expect((await api<{ groups: unknown[] }>(student, '/api/teaching')).body.groups).toEqual([])

  // Aufräumen
  expect((await api(teacher, `/api/learn/groups/${c9}/modules`, 'PUT', { modules: [] })).status).toBe(200)
  expect((await api(admin, `${ADMIN_URL}/api/admin/groups/${d9}`, 'DELETE')).status).toBe(200)
  expect((await api(admin, `${ADMIN_URL}/api/admin/groups/${c9}`, 'PATCH', { level: null })).status).toBe(200)
  expect((await api(admin, `${ADMIN_URL}/api/admin/organization`, 'PATCH', { state: null, schoolForm: null })).status).toBe(200)
  for (const page of [admin, teacher, student]) await page.context().close()
})
