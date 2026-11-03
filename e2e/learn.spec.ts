import { expect, test, type Browser, type Page } from '@playwright/test'
import { ADMIN_URL, APP_URL } from '../playwright.config'
import { changePassword, gotoHydrated, loginWithPassword } from './utils'

// Lernmodule in der Klonk Cloud: Freigabe je Gruppe, Projekt je Modul, Lernstand für die Gruppenleitung,
// automatische Prüfung (Klonk-Script und Blöcke). Jeder Kontext = eigenes Gerät (eigenes OPFS).
test.use({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })
test.describe.configure({ mode: 'serial' })

const TEACHER = ['lena@gym-muster.de', 'lena-geheim'] as const
const STUDENT = ['tom@gym-muster.de', 'tom-geheim'] as const

async function device(browser: Browser, baseUrl: string, [identifier, password]: readonly [string, string]) {
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()
  await loginWithPassword(page, `${baseUrl}/login`, identifier, password)
  return page
}

/** JSON-API aus der Seite heraus (Cookies wie im Browser) */
function api<T = unknown>(page: Page, url: string, method = 'GET', body?: unknown) {
  return page.evaluate(async ({ url, method, body }) => {
    const res = await fetch(url, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: res.status, body: await res.json().catch(() => null) }
  }, { url, method, body }) as Promise<{ status: number, body: T }>
}

type Changes = { changes: { path: string, revision: number, content: string | null }[] }

/** Programm einer Aufgabe ins Modulprojekt schreiben (wie von den Lernenden gespeichert) */
async function prepare(page: Page, module: string, task: string, language: 'klonk' | 'blocks', code: string) {
  const { body: project } = await api<{ id: string }>(page, `/api/learn/modules/${module}/start`, 'POST', { lang: 'de' })
  const files = async () => (await api<Changes>(page, `/api/cloud/projects/${project.id}/changes?since=0`)).body.changes
  const revision = async (path: string) => (await files()).find(c => c.path === path)?.revision ?? 0
  const put = async (path: string, content: string) => expect((await api(page, `/api/cloud/projects/${project.id}/files`, 'PUT', { path, content, baseRevision: await revision(path) })).status).toBe(200)
  await put(`${task}.${language}`, code)
  const manifest = JSON.parse((await files()).find(c => c.path === 'klonk.json')!.content!)
  manifest.learn.languages[task] = language
  await put('klonk.json', JSON.stringify(manifest))
  return project.id
}

async function openTask(page: Page, path: string, editor: 'code-editor' | 'blocks-editor' = 'code-editor') {
  await gotoHydrated(page, `${APP_URL}/learn/${path}`)
  await expect(page.getByTestId(editor)).toHaveAttribute('data-ready', 'true', { timeout: 30_000 })
  await expect(page.getByTestId('world-view')).toHaveAttribute('data-ready', 'true', { timeout: 15_000 })
}

async function check(page: Page) {
  await page.getByTestId('learn-check').click()
  const result = page.getByTestId('learn-result')
  await expect(result).toBeVisible({ timeout: 20_000 })
  return result
}

test('Freigabe, Lernen in der Cloud und Lernstand für die Gruppenleitung', async ({ browser }) => {
  test.setTimeout(240_000)
  // Konto für Tom, Gruppe 9c mit Lena als Leitung
  const admin = await device(browser, ADMIN_URL, ['admin@gym-muster.de', 'admin-passwort'])
  const tom = await api<{ id: string }>(admin, `${ADMIN_URL}/api/admin/users`, 'POST', { username: 'tom', displayName: 'Tom Lernt', role: 'member', password: 'start-tom' })
  expect(tom.status).toBe(200)
  await admin.context().close()
  const teacherAdmin = await device(browser, ADMIN_URL, TEACHER)
  const group = await api<{ id: string }>(teacherAdmin, `${ADMIN_URL}/api/admin/groups`, 'POST', { name: '9c' })
  expect(group.status).toBe(200)
  expect((await api(teacherAdmin, `${ADMIN_URL}/api/admin/groups/${group.body.id}/members`, 'PUT', { userIds: [tom.body.id], role: 'member' })).status).toBe(200)
  await teacherAdmin.context().close()

  // Ohne Freigabe: keine Module – auch der Server verweigert den Start
  const student = await device(browser, APP_URL, ['tom@gym-muster.de', 'start-tom'])
  await changePassword(student, 'start-tom', STUDENT[1])
  await gotoHydrated(student, `${APP_URL}/learn`)
  await expect(student.getByTestId('learn-no-modules')).toBeVisible()
  expect((await api(student, '/api/learn/modules/sequence/start', 'POST', { lang: 'de' })).status).toBe(403)

  // Lehrkraft gibt Modul 1 frei
  const teacher = await device(browser, APP_URL, TEACHER)
  await gotoHydrated(teacher, `${APP_URL}/learn`)
  await teacher.getByTestId('learn-group-9c').getByRole('link', { name: 'Lernstand und Freigabe' }).click()
  await expect(teacher.getByRole('heading', { level: 1 })).toHaveText('Lernstand – 9c')
  await teacher.getByRole('switch', { name: '1. Erste Schritte: Anweisungen' }).click()
  await expect(teacher.getByTestId('learn-cell-tom-sequence')).toHaveText('nicht begonnen')

  // Tom sieht nur Modul 1 und löst die erste Aufgabe – gespeichert im Cloud-Projekt
  await gotoHydrated(student, `${APP_URL}/learn`)
  await expect(student.getByTestId('learn-modules').getByRole('heading', { level: 2 })).toHaveCount(1)
  await expect(student.getByTestId('learn-module-sequence')).toBeVisible()
  expect((await api(student, '/api/learn/modules/repeat/start', 'POST', { lang: 'de' })).status).toBe(403)
  await prepare(student, 'sequence', 'to-the-mark', 'klonk', 'schritt(4)')
  await openTask(student, 'sequence/to-the-mark')
  await expect(await check(student)).toHaveAttribute('data-status', 'solved')
  await expect(student.getByTestId('learn-solved')).toBeVisible()
  // Lernstand liegt in der Cloud (Manifest wird im Hintergrund hochgeladen)
  await expect.poll(async () => (await api<{ projects: Record<string, { solved: string[] }> }>(student, '/api/learn')).body.projects.sequence?.solved, { timeout: 20_000 }).toEqual(['to-the-mark'])
  const projects = (await api<{ projects: { name: string, learnModule: string | null }[] }>(student, '/api/cloud')).body.projects
  expect(projects.find(p => p.learnModule === 'sequence')?.name).toBe('Lernmodul 1 – Erste Schritte – Anweisungen')

  // Lehrkraft sieht den Lernstand und öffnet das Programm (nur lesen)
  await teacher.getByRole('button', { name: 'Aktualisieren' }).click()
  await expect(teacher.getByTestId('learn-cell-tom-sequence')).toHaveText('1/4')
  await expect(teacher.getByTestId('learn-view-tom-to-the-mark')).toHaveAttribute('data-state', 'solved')
  await teacher.screenshot({ path: 'test-results/learn-progress.png' })
  await teacher.getByTestId('learn-view-tom-to-the-mark').click()
  await expect(teacher.getByTestId('learn-viewing')).toContainText('Programm von Tom Lernt')
  await expect(teacher.getByTestId('code-editor')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 })
  await expect(teacher.locator('.monaco-editor .view-lines')).toContainText('schritt(4)')
  await expect(teacher.getByTestId('learn-solved')).toBeVisible()
  await teacher.screenshot({ path: 'test-results/learn-view.png' })

  // Freigabe zurücknehmen ⇒ kein Zugriff mehr
  await teacher.getByRole('link', { name: 'Zurück zum Lernstand' }).click()
  await teacher.getByRole('switch', { name: '1. Erste Schritte: Anweisungen' }).click()
  await gotoHydrated(student, `${APP_URL}/learn`)
  await expect(student.getByTestId('learn-no-modules')).toBeVisible()
  await student.context().close()
  await teacher.context().close()
})

test('Prüfung: Fehlermeldungen, mehrere Welten, Endlosschleifen', async ({ browser }) => {
  test.setTimeout(180_000)
  // Lehrkräfte dürfen alle Module ausprobieren
  const page = await device(browser, APP_URL, TEACHER)
  await prepare(page, 'sequence', 'around-the-corner', 'klonk', 'schritt(2)')
  await openTask(page, 'sequence/around-the-corner')
  await expect(await check(page)).toContainText('auf Feld 3|1 – das Ziel ist Feld 3|4')
  await page.getByTestId('run').click()
  await expect(page.getByTestId('learn-run-result')).toHaveText('Ziel nicht erreicht', { timeout: 20_000 })

  await prepare(page, 'while', 'to-the-wall', 'klonk', 'wiederhole 4 mal\n  schritt\nende\nmarkieren')
  await openTask(page, 'while/to-the-wall')
  await expect(await check(page)).toContainText('Die Aufgabe verlangt eine bedingte Schleife')

  await prepare(page, 'while', 'to-the-wall', 'klonk', 'wiederhole solange nicht istWand\n  schritt\n  wenn positionX == 5 dann\n    abbrechen\n  ende\nende\nmarkieren')
  await openTask(page, 'while/to-the-wall')
  await expect(await check(page)).toContainText('In Welt 2')
  await expect(page.getByTestId('learn-world-2')).toHaveClass(/primary/)

  await prepare(page, 'while', 'find-the-mark', 'klonk', 'wiederhole solange wahr\n  linksDrehen\nende')
  await openTask(page, 'while/find-the-mark')
  await expect(await check(page)).toContainText('endet das Programm nicht', { timeout: 20_000 })
  await page.context().close()
})

test('Blöcke lösen eine Aufgabe, Hinweise für Lehrkräfte', async ({ browser }) => {
  const page = await device(browser, APP_URL, TEACHER)
  const workspace = {
    blocks: {
      languageVersion: 0,
      blocks: [{
        type: 'klonk_repeat_while',
        id: 'loop',
        x: 40,
        y: 40,
        fields: { MODE: 'while' },
        inputs: {
          COND: { block: { type: 'logic_negate', id: 'not', inputs: { BOOL: { block: { type: 'klonk_is_wall', id: 'wall' } } } } },
          DO: { block: { type: 'klonk_step', id: 'step' } },
        },
        next: { block: { type: 'klonk_mark', id: 'mark', fields: { COLOR: 'yellow' } } },
      }],
    },
  }
  await prepare(page, 'while', 'to-the-wall', 'blocks', JSON.stringify(workspace))
  await openTask(page, 'while/to-the-wall', 'blocks-editor')
  await expect(await check(page)).toHaveAttribute('data-status', 'solved')

  await gotoHydrated(page, `${APP_URL}/learn/while`)
  await expect(page.getByTestId('learn-teacher')).toContainText('Zeitbedarf')
  await page.context().close()
})
