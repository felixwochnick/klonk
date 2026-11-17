import { readFileSync } from 'node:fs'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { strFromU8, unzipSync } from 'fflate'
import { ADMIN_URL, APP_URL } from '../playwright.config'
import { canSignLicense, signLicense } from './license'
import { changePassword, gotoHydrated, loginWithPassword, waitForPage } from './utils'

// Unterrichtsmaterial zu Lernmodulen: Lena (Lehrkraft aus admin-accounts.spec.ts) erstellt Arbeitsblatt, Lösungsblatt und
// Präsentation zu E2 – Vorschau mit 3D-Bildern und Bauplänen, Drucken, DOCX/PPTX; eine Schülerin bekommt kein Material.
// Lizenz-Feature `customModules` (wie eigene Lernmodule): ohne gesperrt; am Ende gilt wieder die Lizenz aus admin-license.spec.ts.
test.use({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })

async function device(browser: Browser, baseUrl: string, [identifier, password]: readonly [string, string], newPassword?: string) {
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()
  await loginWithPassword(page, `${baseUrl}/login`, identifier, password)
  if (newPassword) await changePassword(page, password, newPassword)
  return page
}

function api<T = unknown>(page: Page, url: string, method = 'GET', body?: unknown) {
  return page.evaluate(async ({ url, method, body }) => {
    const res = await fetch(url, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: res.status, body: await res.json().catch(() => null) }
  }, { url, method, body }) as Promise<{ status: number, body: T }>
}

/** Funktionen der Instanz-Lizenz aus admin-license.spec.ts */
const FEATURES = ['oidc', 'characters', 'models', 'libraries', 'ai']

const ready = (page: Page) => expect(page.getByTestId('material-status')).toHaveAttribute('data-state', 'ready', { timeout: 120_000 })

async function download(page: Page, testId: string) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId(testId).click()])
  return { name: file.suggestedFilename(), files: unzipSync(readFileSync(await file.path())) }
}

test('Unterrichtsmaterial: Arbeitsblatt, Lösungen und Präsentation', async ({ browser }) => {
  test.setTimeout(420_000)
  test.skip(!canSignLicense, 'Kein Signierschlüssel für diese Testumgebung')
  const admin = await device(browser, ADMIN_URL, ['admin@gym-muster.de', 'admin-passwort'])
  const lena = await device(browser, APP_URL, ['lena@gym-muster.de', 'lena-geheim'])
  // Instanz-Lizenz setzen; die App merkt sich die Lizenz bis zu 60 s
  const license = async (licensed: boolean) => {
    const token = await signLicense({ name: 'Gymnasium Musterstadt', maxUsers: 100, features: licensed ? [...FEATURES, 'customModules'] : FEATURES })
    expect((await api(admin, `${ADMIN_URL}/api/admin/license/instance`, 'PUT', { token })).status).toBe(200)
    await expect.poll(async () => (await api<{ features: string[] }>(lena, '/api/license')).body.features.includes('customModules'), { timeout: 75_000, intervals: [2000] }).toBe(licensed)
  }

  // Ohne Lizenz-Feature: Karte mit Hinweis und gesperrten Knöpfen, die Seite zeigt nur den Hinweis
  await license(false)
  await gotoHydrated(lena, `${APP_URL}/learn/building`)
  await expect(lena.getByTestId('learn-material-license')).toBeVisible()
  await expect(lena.getByTestId('learn-material-worksheet')).toBeDisabled()
  await gotoHydrated(lena, `${APP_URL}/teaching/material/building`)
  await expect(lena.getByTestId('material-license')).toBeVisible()
  await expect(lena.getByTestId('material-preview')).toHaveCount(0)

  // Einstieg über die Modulseite
  await license(true)
  await gotoHydrated(lena, `${APP_URL}/learn/building`)
  await expect(lena.getByTestId('learn-material')).toBeVisible()
  await expect(lena.getByTestId('learn-material-license')).toHaveCount(0)
  await lena.getByTestId('learn-material-worksheet').click()
  await waitForPage(lena, url => url.pathname === '/teaching/material/building')
  await expect(lena.getByTestId('material-title')).toHaveText('E2 Bauen nach Bauplan')
  await ready(lena)

  const preview = lena.frameLocator('[data-testid="material-preview"]')
  await expect(preview.locator('h1')).toHaveText('Bauen nach Bauplan')
  await expect(preview.locator('h2')).toHaveText(['Aufgabe 1: Ein Turm', 'Aufgabe 2: Treppe', 'Aufgabe 3: Mauer', 'Aufgabe 4: Abriss'])
  await expect(preview.locator('.fields')).toContainText('Klasse:')
  // 3D-Ansicht (Renderer) und Draufsicht, bei Bauaufgaben auch das Ziel
  await expect(preview.locator('img[data-kind="world"]').first()).toBeVisible()
  await expect(preview.locator('img[data-kind="plan"]').first()).toBeVisible()
  await expect(preview.locator('figcaption', { hasText: /^Ziel$/ }).first()).toBeVisible()
  const size = await preview.locator('img[data-kind="world"]').first().evaluate(img => (img as HTMLImageElement).naturalWidth)
  expect(size).toBeGreaterThan(200)
  await expect(preview.locator('.lines').first().locator('.write')).not.toHaveCount(0)

  // Drucken öffnet den Druckdialog des Vorschau-Dokuments
  await lena.getByTestId('material-preview').evaluate((frame) => {
    const win = (frame as HTMLIFrameElement).contentWindow as Window & { printed?: boolean }
    win.print = () => (win.printed = true)
  })
  await lena.getByTestId('material-print').click()
  expect(await lena.getByTestId('material-preview').evaluate(frame => ((frame as HTMLIFrameElement).contentWindow as Window & { printed?: boolean }).printed)).toBe(true)

  // DOCX
  const docx = await download(lena, 'material-docx')
  expect(docx.name).toBe('E2 Bauen nach Bauplan – Arbeitsblatt.docx')
  const document = strFromU8(docx.files['word/document.xml']!)
  expect(document).toContain('Aufgabe 1: Ein Turm')
  expect(document).toContain('Dein Programm:')
  expect(Object.keys(docx.files).filter(name => name.startsWith('word/media/')).length).toBeGreaterThan(3)

  // Aufgaben auswählen
  await lena.getByTestId('material-task-stairs').click()
  await lena.getByTestId('material-task-wall').click()
  await ready(lena)
  await expect(preview.locator('h2')).toHaveText(['Aufgabe 1: Ein Turm', 'Aufgabe 4: Abriss'])

  // Lösungsblatt: Musterlösung in Klonk-Script, Hinweise für Lehrkräfte
  await lena.getByTestId('material-tab-solutions').click()
  await ready(lena)
  await expect(lena).toHaveURL(/type=solutions/)
  await expect(preview.locator('.box.teacher')).toBeVisible()
  await expect(preview.locator('.box.solution pre').first()).toContainText('hinlegen')
  await expect(preview.locator('.lines')).toHaveCount(0)

  // Präsentation auf Englisch: PPTX mit allen Folien der Vorschau
  await lena.getByTestId('material-tab-slides').click()
  await lena.getByTestId('material-lang').click()
  await lena.getByRole('option', { name: 'English' }).click()
  await ready(lena)
  await expect(preview.locator('.slide.title h1')).toHaveText('Building from a plan')
  const slides = await preview.locator('.slide').count()
  expect(slides).toBeGreaterThan(5)
  await expect(preview.locator('.slide .kicker', { hasText: /^Task 4$/i })).toHaveCount(1)
  const pptx = await download(lena, 'material-pptx')
  expect(pptx.name).toBe('E2 Building from a plan – Presentation.pptx')
  expect(Object.keys(pptx.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))).toHaveLength(slides)
  expect(strFromU8(pptx.files['ppt/slides/slide1.xml']!)).toContain('Building from a plan')

  // Einstieg aus dem Unterricht: Programmiersprache bei Reihe F
  await gotoHydrated(lena, `${APP_URL}/teaching/material/code-start?type=solutions`)
  await ready(lena)
  await lena.getByTestId('material-code-language').click()
  await lena.getByRole('option', { name: 'Java', exact: true }).click()
  await ready(lena)
  await expect(preview.locator('.box.solution pre').first()).toContainText('klonk.turnLeft();')

  // Lernende einer Schule bekommen kein Material (es enthält Musterlösungen) – auch mit Lizenz
  const pupil = await api<{ id: string }>(admin, `${ADMIN_URL}/api/admin/users`, 'POST', { username: 'marla', displayName: 'Marla Material', role: 'member', password: 'start-marla' })
  expect(pupil.status).toBe(200)
  const marla = await device(browser, APP_URL, ['marla@gym-muster.de', 'start-marla'], 'marla-geheim')
  await gotoHydrated(marla, `${APP_URL}/learn/building`)
  await expect(marla.getByRole('heading', { name: 'Bauen nach Bauplan' })).toBeVisible()
  await expect(marla.getByTestId('learn-material')).toHaveCount(0)
  await gotoHydrated(marla, `${APP_URL}/teaching/material/building`)
  await expect(marla.getByTestId('material-denied')).toBeVisible()
  await expect(marla.getByTestId('material-preview')).toHaveCount(0)
  await marla.context().close()
  expect((await api(admin, `${ADMIN_URL}/api/admin/users/${pupil.body.id}`, 'DELETE')).status).toBe(200)

  // Lizenz aus admin-license.spec.ts wiederherstellen
  await license(false)
  await lena.context().close()
  await admin.context().close()
})
