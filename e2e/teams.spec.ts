import { expect, test, type Browser, type Page } from '@playwright/test'
import { ADMIN_URL, APP_URL } from '../playwright.config'
import { changePassword, gotoHydrated, loginWithPassword } from './utils'

// Untergruppen (Teams) einer Klasse: gemeinsames Projekt (alle bearbeiten live dieselben Dateien) und gemeinsame Welt
// (alle steuern ihre eigene Figur in einer Welt). Eigene Lernende Ida und Ben in Klasse 8t (Leitung Lena); baut auf
// admin-accounts.spec.ts auf (Schule gym-muster.de, Lena) und räumt am Ende auf. Jeder Kontext = eigenes Gerät.
test.use({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })

async function device(browser: Browser, baseUrl: string, identifier: string, password: string) {
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

/** Gemeinsames Projekt der Untergruppe im Explorer öffnen, dann die Programmdatei in der IDE */
async function openTeamProject(page: Page, team: string, file: string) {
  await gotoHydrated(page, `${APP_URL}/projects`)
  await page.getByTestId(`cloud-group-${team}`).click()
  await page.getByTestId(`explorer-file-${file}`).click()
  await expect(page.getByTestId('ide')).toBeVisible()
  await expect(page.getByTestId('live-project-bar')).toHaveAttribute('data-status', 'online', { timeout: 20_000 })
}

test('Untergruppen: gemeinsames Projekt live bearbeiten, gemeinsame Welt mit eigener Figur', async ({ browser }) => {
  test.setTimeout(300_000)
  // Zwei Lernende, Klasse 8t mit Lena als Leitung
  const admin = await device(browser, ADMIN_URL, 'admin@gym-muster.de', 'admin-passwort')
  const ida = await api<{ id: string }>(admin, `${ADMIN_URL}/api/admin/users`, 'POST', { username: 'ida', displayName: 'Ida Team', role: 'member', password: 'start-ida' })
  const ben = await api<{ id: string }>(admin, `${ADMIN_URL}/api/admin/users`, 'POST', { username: 'ben', displayName: 'Ben Team', role: 'member', password: 'start-ben' })
  expect([ida.status, ben.status]).toEqual([200, 200])
  const teacherAdmin = await device(browser, ADMIN_URL, 'lena@gym-muster.de', 'lena-geheim')
  const group = await api<{ id: string }>(teacherAdmin, `${ADMIN_URL}/api/admin/groups`, 'POST', { name: '8t' })
  expect(group.status).toBe(200)
  expect((await api(teacherAdmin, `${ADMIN_URL}/api/admin/groups/${group.body.id}/members`, 'PUT', { userIds: [ida.body.id, ben.body.id], role: 'member' })).status).toBe(200)
  await teacherAdmin.context().close()

  // Lehrkraft legt zwei Untergruppen an: gemeinsames Projekt (Klonk-Script) und gemeinsame Welt
  const teacher = await device(browser, APP_URL, 'lena@gym-muster.de', 'lena-geheim')
  await gotoHydrated(teacher, `${APP_URL}/teaching/groups/${group.body.id}`)
  const subgroups = teacher.getByTestId('subgroups')
  await expect(subgroups).toContainText('Noch keine Untergruppen.')
  await subgroups.getByTestId('subgroups-create').click()
  await expect(teacher.getByTestId('subgroup-name')).toHaveValue('Team 1')
  await teacher.getByTestId('subgroup-language').click()
  await teacher.getByRole('option', { name: 'Klonk-Script' }).click()
  await teacher.getByRole('checkbox', { name: 'Ida Team' }).check()
  await teacher.getByRole('checkbox', { name: 'Ben Team' }).check()
  await teacher.getByTestId('subgroup-submit').click()
  await expect(subgroups.getByTestId('subgroup-Team 1')).toContainText('Ben Team, Ida Team')
  await expect(subgroups.getByTestId('subgroup-mode-Team 1')).toHaveText('Gemeinsames Projekt')

  // Team 2: gemeinsame Welt (dieselben beiden)
  await subgroups.getByTestId('subgroups-create').click()
  await expect(teacher.getByTestId('subgroup-name')).toHaveValue('Team 2')
  await teacher.getByRole('radio', { name: /Gemeinsame Welt/ }).check()
  await teacher.getByRole('checkbox', { name: 'Ida Team' }).check()
  await teacher.getByRole('checkbox', { name: 'Ben Team' }).check()
  // Beide sind schon in Team 1 – erlaubt, aber sichtbar
  await expect(teacher.getByTestId('subgroup-members')).toContainText('schon in Team 1')
  await teacher.getByTestId('subgroup-submit').click()
  await expect(subgroups.getByTestId('subgroup-mode-Team 2')).toHaveText('Gemeinsame Welt')
  // Team 3: gemeinsames Projekt mit Blöcken (Vorgabe)
  await subgroups.getByTestId('subgroups-create').click()
  await expect(teacher.getByTestId('subgroup-name')).toHaveValue('Team 3')
  await teacher.getByRole('checkbox', { name: 'Ida Team' }).check()
  await teacher.getByRole('checkbox', { name: 'Ben Team' }).check()
  await teacher.getByTestId('subgroup-submit').click()
  await expect(subgroups.getByTestId('subgroup-Team 3')).toContainText('Ben Team, Ida Team')
  // Untergruppen sind keine eigenen Klassen (Unterricht/Lernmodule zählen sie nicht)
  const teaching = (await api<{ groups: { name: string }[] }>(teacher, '/api/teaching')).body.groups.map(g => g.name)
  expect(teaching).toContain('8t')
  expect(teaching).not.toContain('Team 1')
  await teacher.screenshot({ path: 'test-results/teams-teacher.png', fullPage: true })

  // Lernende melden sich an und öffnen das gemeinsame Projekt
  const idaPage = await device(browser, APP_URL, 'ida@gym-muster.de', 'start-ida')
  await changePassword(idaPage, 'start-ida', 'ida-geheim')
  const benPage = await device(browser, APP_URL, 'ben@gym-muster.de', 'start-ben')
  await changePassword(benPage, 'start-ben', 'ben-geheim')
  await openTeamProject(idaPage, 'Team 1', 'programm.klonk')
  await openTeamProject(benPage, 'Team 1', 'programm.klonk')
  await expect(idaPage.getByTestId('live-peer-Ben Team')).toBeVisible()
  await expect(benPage.getByTestId('live-peer-Ida Team')).toBeVisible()
  await expect(benPage.getByTestId('editor-tab-presence-programm.klonk')).toBeVisible()

  // Ida tippt – Ben sieht es sofort (noch ungespeichert); Ida speichert – bei Ben ist es dann auch gespeichert
  await expect(idaPage.getByTestId('code-editor')).toHaveAttribute('data-ready', 'true')
  await idaPage.getByTestId('code-editor').click()
  await idaPage.keyboard.press('Control+End')
  await idaPage.keyboard.type('\n//Ida-war-hier')
  await expect(benPage.getByTestId('code-editor')).toContainText('//Ida-war-hier', { timeout: 10_000 })
  await expect(benPage.getByTestId('editor-tab-unsaved-programm.klonk')).toBeVisible()
  await idaPage.keyboard.press('Control+s')
  await expect(benPage.getByTestId('editor-tab-unsaved-programm.klonk')).toHaveCount(0, { timeout: 20_000 })
  // Ben antwortet in derselben Datei
  await benPage.getByTestId('code-editor').click()
  await benPage.keyboard.press('Control+End')
  await benPage.keyboard.type('\n//Ben-auch')
  await expect(idaPage.getByTestId('code-editor')).toContainText('//Ben-auch', { timeout: 10_000 })
  // Idas Cursor bleibt, wo er war (Bens Text kam danach)
  await idaPage.keyboard.type('!')
  await expect(benPage.getByTestId('code-editor')).toContainText('//Ida-war-hier!', { timeout: 10_000 })
  await idaPage.screenshot({ path: 'test-results/teams-project.png' })
  await benPage.keyboard.press('Control+s')
  await expect(idaPage.getByTestId('editor-tab-unsaved-programm.klonk')).toHaveCount(0, { timeout: 20_000 })

  // Blöcke im gemeinsamen Projekt: jede:r zieht einen Block – beide Stapel kommen bei beiden an
  await openTeamProject(idaPage, 'Team 3', 'programm.blocks')
  await openTeamProject(benPage, 'Team 3', 'programm.blocks')
  for (const [page, name, y] of [[idaPage, 'linksDrehen', 300], [benPage, 'rechtsDrehen', 130]] as const) {
    await expect(page.getByTestId('blocks-editor')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
    await page.getByTestId('toggle-code').click()
    const box = (await page.getByTestId('blocks-editor').boundingBox())!
    const source = page.locator('.blocklyFlyout .blocklyDraggable').filter({ hasText: name }).first()
    await source.dragTo(page.getByTestId('blocks-editor'), { targetPosition: { x: box.width - 90, y: box.height - y } })
    await expect(page.getByTestId('generated-code')).toContainText(name)
  }
  for (const page of [idaPage, benPage]) {
    await expect(page.getByTestId('generated-code')).toContainText('linksDrehen', { timeout: 10_000 })
    await expect(page.getByTestId('generated-code')).toContainText('rechtsDrehen', { timeout: 10_000 })
  }
  await benPage.screenshot({ path: 'test-results/teams-blocks.png' })
  await benPage.keyboard.press('Control+s')
  await expect(idaPage.getByTestId('editor-tab-unsaved-programm.blocks')).toHaveCount(0, { timeout: 20_000 })

  // Gemeinsame Welt: beide treten bei, jede:r bekommt eine eigene Figur auf einem Startplatz
  for (const page of [idaPage, benPage]) {
    await page.getByTestId('live-world-join').click()
    await page.getByRole('menuitem', { name: 'Team 2 (8t)' }).click()
    await expect(page.getByTestId('live-world-bar')).toHaveAttribute('data-status', 'online', { timeout: 20_000 })
  }
  await expect(idaPage.getByTestId('live-world-bar')).toHaveAttribute('data-figure', 'Ida Team')
  await expect(benPage.getByTestId('live-world-bar')).toHaveAttribute('data-figure', 'Ben Team')
  await expect(benPage.getByTestId('live-player-Ida Team')).toBeVisible()

  // Ida führt das gemeinsame Blockprogramm mit ihrer Figur aus (bis zur Wand, dazu zwei Drehungen) – Ben sieht es
  await idaPage.getByTestId('run').click()
  await expect(idaPage.getByTestId('run-state')).toHaveAttribute('data-state', 'done', { timeout: 90_000 })
  const idaDone = '["Ida Team",0,9,"south"]'
  await expect(benPage.getByTestId('live-world-bar')).toHaveAttribute('data-figures', new RegExp(idaDone.replace(/[[\]]/g, '\\$&')))
  await expect(benPage.getByTestId('live-world-bar')).toHaveAttribute('data-figures', /\["Ben Team",9,9,"north"\]/)
  await benPage.screenshot({ path: 'test-results/teams-world.png' })

  // Lehrkraft sieht der gemeinsamen Welt zu (ohne eigene Figur)
  await gotoHydrated(teacher, `${APP_URL}/teaching/groups/${group.body.id}`)
  await teacher.getByTestId('subgroup-open-Team 2').click()
  const bar = teacher.getByTestId('live-world-bar')
  await expect(bar).toHaveAttribute('data-status', 'online', { timeout: 20_000 })
  await expect(bar).toContainText('Du schaust zu')
  await expect(bar).toHaveAttribute('data-figures', new RegExp(idaDone.replace(/[[\]]/g, '\\$&')))
  await expect(teacher.getByTestId('live-player-Ben Team')).toBeVisible()
  await teacher.screenshot({ path: 'test-results/teams-teacher-world.png' })

  // Aufräumen: Klasse (mit Untergruppen) und Konten
  for (const page of [idaPage, benPage, teacher]) await page.context().close()
  expect((await api(admin, `${ADMIN_URL}/api/admin/groups/${group.body.id}`, 'DELETE')).status).toBe(200)
  for (const id of [ida.body.id, ben.body.id]) expect((await api(admin, `${ADMIN_URL}/api/admin/users/${id}`, 'DELETE')).status).toBe(200)
  await admin.context().close()
})
