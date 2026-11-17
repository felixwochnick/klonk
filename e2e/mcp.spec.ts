import { createHash, randomBytes } from 'node:crypto'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { ADMIN_URL, APP_URL, AUTH_URL } from '../playwright.config'
import { canSignLicense, signLicense } from './license'
import { gotoHydrated, loginWithPassword } from './utils'

// MCP-Server von App und Verwaltung: Verwaltung schaltet den KI-Zugriff je Konto frei, Lehrkraft verbindet einen
// KI-Assistenten per persönlichem Token bzw. OAuth (Zustimmungsseite auf auth.*). Baut auf learn.spec.ts auf
// (Gruppe 9c, Leitung Lena, Lernender Tom), braucht das Lizenz-Feature `mcp` und hinterlässt die Lizenz aus admin-license.spec.ts.
test.use({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })
test.describe.configure({ mode: 'serial' })
test.skip(!canSignLicense, 'Lizenz-Signierschlüssel fehlt')

/** Funktionen der Instanz-Lizenz aus admin-license.spec.ts */
const FEATURES = ['oidc', 'characters', 'models', 'libraries', 'ai']

const ADMIN = ['admin@gym-muster.de', 'admin-passwort'] as const
const TEACHER = ['lena@gym-muster.de', 'lena-geheim'] as const

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

type ToolResult = { isError?: boolean, content: { type: string, text: string }[] }

/** MCP-Client im Kleinen: JSON-RPC über Streamable HTTP (zustandslos, JSON-Antworten) */
function mcp(request: APIRequestContext, url: string, token?: string) {
  let id = 0
  async function rpc(method: string, params: Record<string, unknown> = {}) {
    const res = await request.post(url, {
      headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      data: { jsonrpc: '2.0', id: ++id, method, params },
    })
    return { status: res.status(), headers: res.headers(), body: await res.json().catch(() => null) }
  }
  return {
    rpc,
    async tools() {
      const { body } = await rpc('tools/list')
      return (body.result.tools as { name: string, annotations?: Record<string, boolean> }[]).map(t => t.name)
    },
    async call<T = unknown>(name: string, args: Record<string, unknown> = {}) {
      const { body } = await rpc('tools/call', { name, arguments: args })
      const result = body.result as ToolResult
      return { error: result.isError ? result.content[0]!.text : null, data: result.isError ? null : JSON.parse(result.content[0]!.text) as T }
    },
  }
}

/** Instanz-Lizenz setzen und warten, bis App, Verwaltung und Anmeldung sie kennen (sie merken sich die Lizenz bis zu 60 s) */
async function setLicense(admin: Page, teacher: Page, mcp: boolean) {
  const token = await signLicense({ name: 'Gymnasium Musterstadt', maxUsers: 100, features: mcp ? [...FEATURES, 'mcp'] : FEATURES })
  expect((await api(admin, `${ADMIN_URL}/api/admin/license/instance`, 'PUT', { token })).status).toBe(200)
  for (const base of [APP_URL, ADMIN_URL, AUTH_URL]) {
    await expect.poll(async () => ((await (await teacher.request.get(`${base}/api/license`)).json()).features as string[]).includes('mcp'), { timeout: 75_000, intervals: [2000] }).toBe(mcp)
  }
}

let classId = ''
let writeToken = ''

test('Verwaltung schaltet KI-Zugriff frei, Lehrkraft verbindet per Token', async ({ browser, request }) => {
  test.setTimeout(300_000)
  // Ohne Freischaltung: Einstellungen zeigen den Hinweis, Tokens lassen sich nicht anlegen
  const teacher = await device(browser, APP_URL, TEACHER)
  await gotoHydrated(teacher, `${APP_URL}/settings`)
  await expect(teacher.getByTestId('mcp-disabled')).toBeVisible()
  expect((await api(teacher, `${APP_URL}/api/mcp/tokens`, 'POST', { name: 'x', access: 'read', days: 30 })).status).toBe(403)

  // Admin: Konten → Lena → KI-Zugriff „Lesen und ändern“
  const admin = await device(browser, ADMIN_URL, ADMIN)
  await gotoHydrated(admin, `${ADMIN_URL}/users`)
  await admin.getByRole('button', { name: 'Aktionen für Lena Lehrkraft' }).click()
  await admin.getByRole('menuitem', { name: 'KI-Zugriff (MCP) …' }).click()
  // Die Lizenz enthält MCP noch nicht – die Stufe lässt sich trotzdem schon setzen
  await expect(admin.getByTestId('user-mcp-unlicensed')).toBeVisible()
  await admin.getByTestId('user-mcp-access').getByText('Lesen und ändern').click()
  await admin.getByTestId('user-mcp-save').click()
  await expect(admin.getByRole('row', { name: /Lena Lehrkraft/ }).getByTestId('user-mcp-badge')).toHaveText('KI: Lesen und ändern')

  // Ohne Lizenz-Feature `mcp`: Hinweis, keine neuen Tokens – auch nicht über die API
  await gotoHydrated(teacher, `${APP_URL}/settings`)
  await expect(teacher.getByTestId('mcp-access')).toHaveText('Lesen und ändern')
  await expect(teacher.getByTestId('mcp-unlicensed')).toBeVisible()
  await expect(teacher.getByTestId('mcp-new-token')).toBeDisabled()
  const unlicensed = await api<{ message: string }>(teacher, `${APP_URL}/api/mcp/tokens`, 'POST', { name: 'x', access: 'read', days: 30 })
  expect([unlicensed.status, unlicensed.body.message]).toEqual([402, 'feature_required'])

  // Mit Lizenz: Stufe und Adressen in den Einstellungen, Token „Nur lesen“ anlegen
  await setLicense(admin, teacher, true)
  await gotoHydrated(teacher, `${APP_URL}/settings`)
  await expect(teacher.getByTestId('mcp-unlicensed')).toHaveCount(0)
  await expect(teacher.getByTestId('mcp-url-app')).toHaveText(`${APP_URL}/mcp`)
  await expect(teacher.getByTestId('mcp-url-admin')).toHaveText(`${ADMIN_URL}/mcp`)
  await teacher.getByTestId('mcp-new-token').click()
  await teacher.getByTestId('mcp-token-name').fill('E2E nur lesen')
  await teacher.getByTestId('mcp-token-create').click()
  const readToken = (await teacher.getByTestId('mcp-token-value').textContent())!.trim()
  expect(readToken).toMatch(/^klonk_pat_/)
  await expect(teacher.getByTestId('mcp-token')).toContainText('E2E nur lesen')
  // Mehr als die eigene Stufe geht nicht
  expect((await api(teacher, `${APP_URL}/api/mcp/tokens`, 'POST', { name: 'voll', access: 'full', days: 30 })).status).toBe(403)

  // Ohne Token: 401 mit Verweis auf die OAuth-Metadaten
  const anonymous = await mcp(request, `${APP_URL}/mcp`).rpc('tools/list')
  expect(anonymous.status).toBe(401)
  expect(anonymous.headers['www-authenticate']).toContain(`resource_metadata="${APP_URL}/.well-known/oauth-protected-resource/mcp"`)

  // Nur lesen: Übersicht ja, Freigeben nicht angeboten
  const reader = mcp(request, `${APP_URL}/mcp`, readToken)
  const init = await reader.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } })
  expect(init.body.result.serverInfo.name).toBe('klonk-app')
  expect(init.body.result.instructions).toContain('learning modules')
  const readTools = await reader.tools()
  expect(readTools).toEqual(expect.arrayContaining(['get_account', 'get_teaching_overview', 'list_learn_modules', 'get_class']))
  expect(readTools).not.toContain('release_learn_modules')
  const account = await reader.call<{ displayName: string, mcpAccess: string }>('get_account')
  expect(account.data).toMatchObject({ displayName: 'Lena Lehrkraft', mcpAccess: 'read' })
  const overview = await reader.call<{ classes: { id: string, name: string }[] }>('get_teaching_overview')
  classId = overview.data!.classes.find(c => c.name === '9c')!.id
  expect((await reader.call('release_learn_modules', { class: '9c', modules: ['E5'] })).error).toMatch(/not found/i)

  // Lesen und ändern: Modul E5 für die 9c freigeben, Klasse in Teams aufteilen
  writeToken = (await api<{ token: string }>(teacher, `${APP_URL}/api/mcp/tokens`, 'POST', { name: 'E2E schreiben', access: 'write', days: 30 })).body.token
  const writer = mcp(request, `${APP_URL}/mcp`, writeToken)
  expect(await writer.tools()).toEqual(expect.arrayContaining(['release_learn_modules', 'split_class_into_teams', 'create_subgroups']))
  expect(await writer.tools()).not.toContain('delete_subgroup')
  const released = await writer.call<{ released: { code: string, languages: string }[] }>('release_learn_modules', { class: '9c', modules: ['E5'], language: 'blocks' })
  expect(released.error).toBeNull()
  expect(released.data!.released).toContainEqual(expect.objectContaining({ code: 'E5', languages: 'blocks' }))
  const progress = await api<{ modules: string[], languages: Record<string, string> }>(teacher, `${APP_URL}/api/learn/groups/${classId}`)
  expect(progress.body.languages).toMatchObject({ repeat: 'blocks' })
  expect((await writer.call('release_learn_modules', { class: '9c', modules: ['Z99'] })).error).toContain('Z99')

  const teams = await writer.call<{ created: { id: string, name: string, members: string[] }[] }>('split_class_into_teams', { class: '9c', teamSize: 2, mode: 'world' })
  expect(teams.error).toBeNull()
  expect(teams.data!.created.flatMap(t => t.members)).toContain('Tom Lernt')
  const details = await writer.call<{ subgroups: { name: string, mode: string, members: string[] }[] }>('get_class', { class: '9c' })
  expect(details.data!.subgroups).toContainEqual(expect.objectContaining({ name: teams.data!.created[0]!.name, mode: 'world' }))

  // Derselbe Token gilt auch für die Verwaltung (persönliche Tokens sind nicht an einen Server gebunden)
  const adminMcp = mcp(request, `${ADMIN_URL}/mcp`, writeToken)
  const adminTools = await adminMcp.tools()
  expect(adminTools).toEqual(expect.arrayContaining(['list_groups', 'create_group', 'add_group_members']))
  expect(adminTools).not.toContain('create_users') // nur Admins mit voller Stufe
  const groups = await adminMcp.call<{ name: string, level: string | null }[]>('list_groups')
  expect(groups.data!.map(g => g.name)).toContain('9c')
  const members = await adminMcp.call<{ members: { displayName: string, role: string }[] }>('get_group', { group: '9c' })
  expect(members.data!.members).toContainEqual(expect.objectContaining({ displayName: 'Tom Lernt', role: 'member' }))

  // Aufräumen: Teams löschen, Freigabe zurücknehmen
  for (const team of teams.data!.created) expect((await api(teacher, `${APP_URL}/api/teaching/subgroups/${team.id}`, 'DELETE')).status).toBe(200)
  const withdrawn = await writer.call<{ released: { code: string }[] }>('withdraw_learn_modules', { class: '9c', modules: ['E5'] })
  expect(withdrawn.data!.released.map(r => r.code)).not.toContain('E5')
  await Promise.all([teacher.context().close(), admin.context().close()])
})

test('OAuth: KI-Assistent meldet sich an, Lehrkraft stimmt zu und kann widerrufen', async ({ browser, request }) => {
  test.setTimeout(240_000)
  // Metadaten: App verweist auf die zentrale Anmeldung als Autorisierungsserver
  const resource = await (await request.get(`${APP_URL}/.well-known/oauth-protected-resource/mcp`)).json()
  expect(resource).toMatchObject({ resource: `${APP_URL}/mcp`, authorization_servers: [AUTH_URL] })
  const metadata = await (await request.get(`${AUTH_URL}/.well-known/oauth-authorization-server`)).json()
  expect(metadata).toMatchObject({ issuer: AUTH_URL, registration_endpoint: `${AUTH_URL}/oauth/register`, code_challenge_methods_supported: ['S256'] })

  // Programm registriert sich selbst (RFC 7591)
  const redirectUri = 'http://localhost:9/callback'
  const registration = await request.post(metadata.registration_endpoint, { data: { client_name: 'E2E-Assistent', redirect_uris: [redirectUri] } })
  expect(registration.status()).toBe(201)
  const client = await registration.json()
  expect((await request.post(metadata.registration_endpoint, { data: { redirect_uris: ['http://evil.example/cb'] } })).status()).toBe(400)

  // Zustimmung im Browser der Lehrkraft (PKCE)
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const teacher = await device(browser, APP_URL, TEACHER)
  let callback: URL | null = null
  await teacher.route('http://localhost:9/**', async (route) => {
    callback = new URL(route.request().url())
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<p>ok</p>' })
  })
  const authorize = new URL(metadata.authorization_endpoint)
  authorize.search = new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: 'S256', state: 'e2e-state', scope: 'mcp:read', resource: `${APP_URL}/mcp` }).toString()
  await gotoHydrated(teacher, authorize.href)
  const consent = teacher.getByTestId('oauth-consent')
  await expect(consent).toContainText('E2E-Assistent möchte im Namen von Lena Lehrkraft auf Klonk zugreifen.')
  // Angefragt war nur Lesen – die Lehrkraft erlaubt mehr (höchstens ihre Stufe; „Voll“ wird nicht angeboten)
  await expect(consent.getByText('Voll (auch löschen)')).toHaveCount(0)
  await consent.getByText('Lesen und ändern').click()
  await consent.getByRole('button', { name: 'Erlauben' }).click()
  await expect.poll(() => callback?.searchParams.get('state')).toBe('e2e-state')
  expect(callback!.searchParams.get('iss')).toBe(AUTH_URL)
  const code = callback!.searchParams.get('code')!

  // Code gegen Tokens tauschen (einmalig, mit PKCE)
  const exchange = (form: Record<string, string>) => request.post(metadata.token_endpoint, { form })
  expect((await exchange({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: client.client_id, code_verifier: 'falsch-falsch-falsch-falsch-falsch-falsch-falsch' })).status()).toBe(400)
  // Der fehlgeschlagene Versuch hat den Code verbraucht ⇒ neu zustimmen
  callback = null
  await gotoHydrated(teacher, authorize.href)
  await teacher.getByTestId('oauth-consent').getByText('Lesen und ändern').click()
  await teacher.getByRole('button', { name: 'Erlauben' }).click()
  await expect.poll(() => callback?.searchParams.get('code')).toBeTruthy()
  const tokens = await (await exchange({ grant_type: 'authorization_code', code: callback!.searchParams.get('code')!, redirect_uri: redirectUri, client_id: client.client_id, code_verifier: verifier })).json()
  expect(tokens).toMatchObject({ token_type: 'Bearer', scope: 'mcp:write' })

  // Zugang gilt für den MCP-Server der App (resource), nicht für die Verwaltung
  const assistant = mcp(request, `${APP_URL}/mcp`, tokens.access_token)
  expect(await assistant.tools()).toContain('release_learn_modules')
  expect((await mcp(request, `${ADMIN_URL}/mcp`, tokens.access_token).rpc('tools/list')).status).toBe(401)

  // Refresh-Token erneuert beide Tokens; das alte gilt danach nicht mehr
  const refreshed = await (await exchange({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id })).json()
  expect(refreshed.access_token).not.toBe(tokens.access_token)
  expect((await exchange({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id })).status()).toBe(400)
  expect((await mcp(request, `${APP_URL}/mcp`, tokens.access_token).rpc('tools/list')).status).toBe(401)
  const renewed = mcp(request, `${APP_URL}/mcp`, refreshed.access_token)
  expect((await renewed.call<{ mcpAccess: string }>('get_account')).data!.mcpAccess).toBe('write')

  // Einstellungen: Verbindung sichtbar und widerrufbar
  await gotoHydrated(teacher, `${APP_URL}/settings`)
  const connection = teacher.getByTestId('mcp-token').filter({ hasText: 'E2E-Assistent' })
  await expect(connection).toBeVisible()
  teacher.once('dialog', dialog => dialog.accept())
  await connection.getByRole('button', { name: 'Widerrufen' }).click()
  await expect(connection).toHaveCount(0)
  expect((await renewed.rpc('tools/list')).status).toBe(401)

  // Lizenz ohne MCP: bestehende Tokens sehen nur noch das Konto, mit Hinweis
  const admin = await device(browser, ADMIN_URL, ADMIN)
  await setLicense(admin, teacher, false)
  const unlicensed = mcp(request, `${APP_URL}/mcp`, writeToken)
  expect(await unlicensed.tools()).toEqual(['get_account'])
  expect((await unlicensed.call<{ licensed: boolean }>('get_account')).data!.licensed).toBe(false)
  expect((await unlicensed.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } })).body.result.instructions).toContain('license')

  // Aufräumen: Zugriff wieder aus ⇒ übrige Tokens (aus dem ersten Test) sind getrennt
  const lena = (await api<{ id: string, username: string }[]>(admin, `${ADMIN_URL}/api/admin/users`)).body.find(u => u.username === 'lena')!
  expect((await api(admin, `${ADMIN_URL}/api/admin/users/${lena.id}`, 'PATCH', { mcpAccess: 'none' })).status).toBe(200)
  expect((await api<unknown[]>(teacher, `${APP_URL}/api/mcp/tokens`)).body).toEqual([])
  await Promise.all([teacher.context().close(), admin.context().close()])
})
