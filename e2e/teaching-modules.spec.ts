import { writeFileSync } from 'node:fs'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { ADMIN_URL, APP_URL } from '../playwright.config'
import { canSignLicense, signLicense } from './license'
import { changePassword, gotoHydrated, loginWithPassword } from './utils'

// Eigene Lernmodule (Lizenz-Feature `customModules`): Lena erstellt ein Modul (Welten aus Dateien, Musterlösung mit
// Probelauf), Kolja sieht es nur lesend und arbeitet mit einer Kopie weiter, Lena gibt es für ihre Klasse frei, Mila löst es,
// Lena sieht den Lernstand; ohne Lizenz bleibt das Modul nutzbar, aber nicht bearbeitbar. Braucht die Schule und Lena aus
// admin-accounts.spec.ts, legt eigene Konten (Namen eindeutig über alle Specs) und eine Gruppe an, räumt auf und hinterlässt die Lizenz aus admin-license.spec.ts.
test.use({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })

const TEACHER = ['lena@gym-muster.de', 'lena-geheim'] as const
/** Funktionen der Instanz-Lizenz aus admin-license.spec.ts */
const FEATURES = ['oidc', 'characters', 'models', 'libraries', 'ai']

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

type Changes = { changes: { path: string, revision: number, content: string | null }[] }

/** Programm einer Aufgabe ins Modulprojekt in der Cloud schreiben (wie von den Lernenden gespeichert) */
async function prepare(page: Page, module: string, task: string, code: string) {
  const { body: project } = await api<{ id: string }>(page, `/api/learn/modules/${module}/start`, 'POST', { lang: 'de' })
  const files = async () => (await api<Changes>(page, `/api/cloud/projects/${project.id}/changes?since=0`)).body.changes
  const revision = async (path: string) => (await files()).find(c => c.path === path)?.revision ?? 0
  const put = async (path: string, content: string) => expect((await api(page, `/api/cloud/projects/${project.id}/files`, 'PUT', { path, content, baseRevision: await revision(path) })).status).toBe(200)
  const manifest = JSON.parse((await files()).find(c => c.path === 'klonk.json')!.content!)
  await put(`${manifest.learn.tasks[task]}.klonk`, code)
  manifest.learn.languages[task] = 'klonk'
  await put('klonk.json', JSON.stringify(manifest))
}

async function check(page: Page, path: string) {
  await gotoHydrated(page, `${APP_URL}/learn/${path}`)
  await expect(page.getByTestId('code-editor')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 })
  await page.getByTestId('learn-check').click()
  const result = page.getByTestId('learn-result')
  await expect(result).toBeVisible({ timeout: 60_000 })
  return result
}

/** Startwelt: eine Reihe, Figur links mit Blick nach Osten, gelbe Marke auf Feld `mark` (ab 0) */
function worldFile(name: string, mark: number) {
  const path = test.info().outputPath(name)
  writeFileSync(path, JSON.stringify({
    version: 1,
    size: { width: 6, depth: 1, height: 4 },
    cells: [{ x: mark, z: 0, mark: 'yellow' }],
    characters: [{ id: 'Klonk', model: 'male', x: 0, z: 0, direction: 'east' }],
  }))
  return path
}

test('Eigene Lernmodule: erstellen, für Kolleg:innen sichtbar, freigeben, lösen', async ({ browser }) => {
  test.setTimeout(420_000)
  test.skip(!canSignLicense, 'Kein Signierschlüssel für diese Testumgebung')
  // Zweite Lehrkraft, Schülerin und Lenas Klasse 8b mit Mila
  const admin = await device(browser, ADMIN_URL, ['admin@gym-muster.de', 'admin-passwort'])
  const kai = await api<{ id: string }>(admin, `${ADMIN_URL}/api/admin/users`, 'POST', { username: 'kolja', displayName: 'Kolja Kollege', role: 'teacher', password: 'start-kolja' })
  const mia = await api<{ id: string }>(admin, `${ADMIN_URL}/api/admin/users`, 'POST', { username: 'mila', displayName: 'Mila Lernt', role: 'member', password: 'start-mila' })
  expect([kai.status, mia.status]).toEqual([200, 200])
  const teacherAdmin = await device(browser, ADMIN_URL, TEACHER)
  const group = (await api<{ id: string }>(teacherAdmin, `${ADMIN_URL}/api/admin/groups`, 'POST', { name: '8b' })).body.id
  expect((await api(teacherAdmin, `${ADMIN_URL}/api/admin/groups/${group}/members`, 'PUT', { userIds: [mia.body.id], role: 'member' })).status).toBe(200)
  await teacherAdmin.context().close()

  // Instanz-Lizenz setzen; die App merkt sich die Lizenz bis zu 60 s
  const license = async (custom: boolean) => {
    const token = await signLicense({ name: 'Gymnasium Musterstadt', maxUsers: 100, features: custom ? [...FEATURES, 'customModules'] : FEATURES })
    expect((await api(admin, `${ADMIN_URL}/api/admin/license/instance`, 'PUT', { token })).status).toBe(200)
    await expect.poll(async () => (await api<{ features: string[] }>(lena, '/api/license')).body.features.includes('customModules'), { timeout: 75_000, intervals: [2000] }).toBe(custom)
  }

  // Ohne Lizenz-Feature: Hinweis, Anlegen gesperrt – auch auf dem Server
  const lena = await device(browser, APP_URL, TEACHER)
  await gotoHydrated(lena, `${APP_URL}/teaching`)
  await lena.getByTestId('teaching-custom-modules').click()
  await expect(lena.getByRole('heading', { level: 1 })).toHaveText('Eigene Lernmodule')
  await expect(lena.getByTestId('custom-license')).toBeVisible()
  await expect(lena.getByTestId('custom-new')).toBeDisabled()
  expect((await api(lena, '/api/learn/custom', 'POST', { data: { version: 1, lang: 'de', track: 'basics', title: 'Ohne Lizenz' } })).status).toBe(402)

  // Mit Lizenz legt Lena unter Unterricht ein neues Modul an
  await license(true)
  await gotoHydrated(lena, `${APP_URL}/teaching/modules`)
  await expect(lena.getByTestId('custom-license')).toHaveCount(0)
  await lena.getByTestId('custom-new').click()
  await lena.getByTestId('custom-new-title').fill('Schulhof-Rallye')
  await lena.getByTestId('custom-new-create').click()
  await lena.waitForURL(/\/teaching\/modules\/custom-[0-9a-f-]+$/)
  const id = lena.url().split('/').at(-1)!
  await expect(lena.getByTestId('custom-editor-title')).toHaveText('Schulhof-Rallye')
  await lena.getByTestId('custom-module-code').fill('H1')
  await lena.getByTestId('custom-module-summary').fill('Mit Schleifen über den Schulhof.')
  await expect(lena.getByTestId('custom-readiness')).toHaveAttribute('data-ready', 'false')

  // Aufgabe: Text, zwei Startwelten aus Dateien, Musterlösung in Klonk-Script
  await lena.getByTestId('custom-nav-task-0').click()
  const task = lena.getByTestId('custom-task-0')
  await expect(task.getByTestId('custom-task-problems')).toContainText('Die Musterlösung fehlt.')
  await task.getByTestId('custom-task-title').fill('Zur Bank')
  await task.getByTestId('custom-task-text').fill('Laufe bis zur gelben Marke und färbe sie **rot**.')
  await task.getByTestId('custom-world-file').setInputFiles(worldFile('welt1.klonkworld.json', 3))
  await task.getByTestId('custom-world-add').click()
  await expect(task.getByTestId('custom-world-1')).toBeVisible()
  await task.getByTestId('custom-world-file').setInputFiles(worldFile('welt2.klonkworld.json', 5))
  await task.getByTestId('custom-solution').locator('.view-lines').click()
  await lena.keyboard.insertText('wiederhole solange nicht istMarke\nschritt\nende\nmarkieren(rot)')
  await task.getByTestId('custom-test-run').click()
  await expect(task.getByTestId('custom-test-done')).toContainText('in allen 2 Startsituationen', { timeout: 30_000 })
  await expect(lena.getByTestId('custom-readiness')).toHaveAttribute('data-ready', 'true')
  await lena.screenshot({ path: 'test-results/custom-module-editor.png', fullPage: true })
  await lena.getByTestId('custom-save').click()
  await expect(lena.getByTestId('custom-save-state')).toHaveText('Alles gespeichert')
  const saved = (await api<{ data: { code: string, tasks: { id: string, title: string, worlds: unknown[], solution: string, check: object }[] } }>(lena, `/api/learn/custom/${id}`)).body.data
  expect(saved.code).toBe('H1')
  expect(saved.tasks).toHaveLength(1)
  expect(saved.tasks[0]).toMatchObject({ title: 'Zur Bank', check: { position: true, cells: true } })
  expect(saved.tasks[0]!.worlds).toHaveLength(2)
  expect(saved.tasks[0]!.solution).toContain('markieren(rot)')
  const taskId = saved.tasks[0]!.id

  // Kolja sieht das Modul seiner Kollegin, darf es aber nur ansehen – mit einer Kopie arbeitet er weiter
  const kaiPage = await device(browser, APP_URL, ['kolja@gym-muster.de', 'start-kolja'], 'kolja-geheim')
  await gotoHydrated(kaiPage, `${APP_URL}/teaching/modules`)
  const card = kaiPage.getByTestId('custom-list-others').getByTestId('custom-card-Schulhof-Rallye')
  await expect(card).toContainText('Erstellt von Lena Lehrkraft')
  await expect(card).toContainText('1 Aufgabe')
  await expect(kaiPage.getByTestId('custom-list-mine')).toContainText('Du hast noch kein eigenes Lernmodul erstellt.')
  await kaiPage.screenshot({ path: 'test-results/custom-module-list.png', fullPage: true })
  await card.getByTestId('custom-card-open').click()
  await expect(kaiPage.getByTestId('custom-read-only')).toBeVisible()
  await expect(kaiPage.getByTestId('custom-save')).toHaveCount(0)
  expect((await api(kaiPage, `/api/learn/custom/${id}`, 'PUT', { data: saved })).status).toBe(403)
  expect((await api(kaiPage, `/api/learn/custom/${id}`, 'DELETE')).status).toBe(404)
  await kaiPage.getByTestId('custom-read-only').getByRole('button', { name: 'Duplizieren' }).click()
  await kaiPage.waitForURL(url => url.pathname.startsWith('/teaching/modules/custom-') && !url.pathname.endsWith(id))
  await expect(kaiPage.getByTestId('custom-editor-title')).toHaveText('Schulhof-Rallye (Kopie)')
  await expect(kaiPage.getByTestId('custom-save')).toBeVisible()
  await kaiPage.getByTestId('custom-editor-menu').click()
  await kaiPage.getByRole('menuitem', { name: 'Löschen' }).click()
  await kaiPage.getByTestId('custom-delete-confirm').click()
  await kaiPage.waitForURL(/\/teaching\/modules$/)
  await expect(kaiPage.getByTestId('custom-list-mine')).toContainText('Du hast noch kein eigenes Lernmodul erstellt.')
  await kaiPage.context().close()

  // Mila sieht es erst nach der Freigabe in der Matrix der Unterrichtsseite
  const miaPage = await device(browser, APP_URL, ['mila@gym-muster.de', 'start-mila'], 'mila-geheim')
  expect((await api<{ custom: unknown[] }>(miaPage, '/api/learn')).body.custom).toEqual([])
  expect((await api(miaPage, `/api/learn/custom/${id}`)).status).toBe(404)
  expect((await api(miaPage, `/api/learn/modules/${id}/start`, 'POST', { lang: 'de' })).status).toBe(404)
  await gotoHydrated(lena, `${APP_URL}/teaching`)
  await expect(lena.getByTestId('teaching-section-school')).toBeVisible()
  await expect(lena.getByTestId(`teaching-row-${id}`)).toContainText('H1 Schulhof-Rallye')
  await lena.getByTestId(`teaching-cell-8b-${id}`).click()
  await expect(lena.getByTestId(`teaching-cell-8b-${id}`)).toBeChecked()

  await gotoHydrated(miaPage, `${APP_URL}/learn`)
  const school = miaPage.getByTestId('learn-track-school')
  await expect(school).toContainText('Module deiner Schule')
  await expect(school.getByTestId(`learn-module-${id}`)).toContainText('Modul H1')
  await miaPage.screenshot({ path: 'test-results/custom-module-learn.png' })
  await school.getByTestId(`learn-module-${id}`).getByRole('link').click()
  await expect(miaPage.getByRole('heading', { level: 1 })).toHaveText('Schulhof-Rallye')
  await expect(miaPage.getByTestId(`learn-task-${taskId}`)).toContainText('1. Zur Bank')
  expect((await api(miaPage, `/api/learn/custom/${id}`, 'PUT', { data: saved })).status).toBe(403)

  // Abgezählt löst nur die erste Welt, die Schleife beide
  await prepare(miaPage, id, taskId, 'schritt(3)\nmarkieren(rot)')
  const failed = await check(miaPage, `${id}/${taskId}`)
  await expect(failed).toHaveAttribute('data-status', 'failed')
  await expect(failed).toContainText('In Welt 2')
  await prepare(miaPage, id, taskId, 'wiederhole solange nicht istMarke\n  schritt\nende\nmarkieren(rot)')
  await expect(await check(miaPage, `${id}/${taskId}`)).toHaveAttribute('data-status', 'solved')
  await expect(miaPage.getByTestId('learn-solved')).toBeVisible()
  await expect.poll(async () => (await api<{ projects: Record<string, { solved: string[] }> }>(miaPage, '/api/learn')).body.projects[id]?.solved, { timeout: 20_000 }).toEqual([taskId])
  const projects = (await api<{ projects: { name: string, learnModule: string | null }[] }>(miaPage, '/api/cloud')).body.projects
  expect(projects.find(p => p.learnModule === id)?.name).toBe('Lernmodul H1 – Schulhof-Rallye')
  // Im Explorer geöffnet, führt das Programm zurück in die Lernansicht
  await gotoHydrated(miaPage, `${APP_URL}/projects`)
  await miaPage.getByTestId('cloud-project-Lernmodul H1 – Schulhof-Rallye').click()
  await miaPage.getByTestId('explorer-folder-1 Zur Bank').click()
  await miaPage.getByTestId('explorer-file-1 Zur Bank/Programm.klonk').click()
  await expect(miaPage.getByTestId('learn-task-hint')).toContainText('Aufgabe „Zur Bank“ aus Schulhof-Rallye')
  await miaPage.getByTestId('learn-task-open').click()
  await expect(miaPage).toHaveURL(new RegExp(`/learn/${id}/${taskId}$`))

  // Lena sieht den Lernstand ihrer Klasse
  await gotoHydrated(lena, `${APP_URL}/teaching/groups/${group}`)
  await expect(lena.getByTestId('learn-enable-section-school')).toContainText('Schulhof-Rallye')
  await expect(lena.getByTestId(`learn-cell-mila-${id}`)).toHaveText('1/1')

  // Ohne Lizenz bleibt das Modul nutzbar (ansehen, lösen), aber nicht bearbeitbar
  await license(false)
  await gotoHydrated(lena, `${APP_URL}/teaching/modules/${id}`)
  await expect(lena.getByTestId('custom-license')).toBeVisible()
  await expect(lena.getByTestId('custom-save')).toHaveCount(0)
  await lena.screenshot({ path: 'test-results/custom-module-license.png' })
  expect((await api(lena, `/api/learn/custom/${id}`, 'PUT', { data: saved })).status).toBe(402)
  expect((await api<{ custom: { id: string }[] }>(miaPage, '/api/learn')).body.custom.map(m => m.id)).toEqual([id])
  expect((await api(miaPage, `/api/learn/custom/${id}`)).status).toBe(200)

  // Löschen (auch ohne Lizenz): Modul verschwindet aus der Freigabe, Milas Projekt bleibt
  await gotoHydrated(lena, `${APP_URL}/teaching/modules`)
  await lena.getByTestId('custom-list-mine').getByTestId('custom-card-Schulhof-Rallye').getByTestId('custom-card-menu').click()
  await lena.getByRole('menuitem', { name: 'Löschen' }).click()
  await lena.getByTestId('custom-delete-confirm').click()
  await expect(lena.getByTestId('custom-list-mine')).toContainText('Du hast noch kein eigenes Lernmodul erstellt.')
  const status = (await api<{ custom: unknown[], modules: string[] }>(miaPage, '/api/learn')).body
  expect(status.custom).toEqual([])
  expect(status.modules).not.toContain(id)
  expect((await api<{ projects: { learnModule: string | null }[] }>(miaPage, '/api/cloud')).body.projects.some(p => p.learnModule === id)).toBe(true)

  // Aufräumen
  expect((await api(admin, `${ADMIN_URL}/api/admin/groups/${group}`, 'DELETE')).status).toBe(200)
  for (const user of [kai.body.id, mia.body.id]) expect((await api(admin, `${ADMIN_URL}/api/admin/users/${user}`, 'DELETE')).status).toBe(200)
  for (const page of [admin, lena, miaPage]) await page.context().close()
})
