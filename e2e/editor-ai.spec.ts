import { expect, test } from '@playwright/test'
import { ADMIN_URL, APP_URL } from '../playwright.config'
import { canSignLicense, signLicense } from './license'
import { MOCK_ANSWER, startMockLlm, type MockLlm } from './mock-llm'
import { STACK } from './targets'
import { browserFetch, changePassword, gotoHydrated, loginWithPassword } from './utils'

test.use({ locale: 'de-DE' })
test.describe.configure({ mode: 'serial' })

// Läuft nach admin-license.spec.ts (Lizenz mit Feature `ai`). Im Stack erreicht der App-Container den
// Test-Endpunkt auf dem Rechner nicht ⇒ dort nur die Einstellungen.
let llm: MockLlm | undefined
test.beforeAll(async () => {
  if (!STACK) llm = await startMockLlm()
})
test.afterAll(async () => {
  await llm?.close()
})

test('Verwaltung: eigenen Anbieter einrichten', async ({ page }) => {
  test.skip(!canSignLicense, 'Kein Signierschlüssel für diese Testumgebung')
  await loginWithPassword(page, `${ADMIN_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
  await gotoHydrated(page, `${ADMIN_URL}/organization/ai`)
  // Selbsthosting: keine Klonk-KI zur Auswahl
  await expect(page.getByLabel('Klonk-KI (über Klonk abgerechnet)')).toHaveCount(0)

  await page.getByLabel('Eigener Anbieter (API-Schlüssel)').check()
  await expect(page.getByTestId('ai-locked')).toHaveCount(0)
  await expect(page.getByTestId('ai-preset')).toContainText('Andere (OpenAI-kompatibel)')
  await page.getByLabel('API-Adresse').fill(llm?.url ?? 'http://llm.invalid/v1')
  await page.getByRole('textbox', { name: 'Modell' }).fill('mock-model')
  await page.getByLabel('API-Schlüssel', { exact: true }).fill('test-key')
  await expect(page.getByRole('switch', { name: 'Lernende bekommen nur Hinweise' })).toBeChecked()
  if (llm) {
    await page.getByTestId('ai-test').click()
    await expect(page.getByText('Verbindung erfolgreich', { exact: true })).toBeVisible()
  }
  await page.getByTestId('ai-save').click()
  await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible()

  // Schlüssel wird nie ausgeliefert, bleibt aber gespeichert
  await page.reload()
  await expect(page.getByLabel('API-Adresse')).toHaveValue(llm?.url ?? 'http://llm.invalid/v1')
  await expect(page.getByLabel('API-Schlüssel', { exact: true })).toHaveValue('')
  await expect(page.getByText('Leer lassen, um den gespeicherten Wert zu behalten.')).toBeVisible()

  // Schüler-Konto für den Tipp-Modus
  const created = await browserFetch(page, `${ADMIN_URL}/api/admin/users`, { method: 'POST', body: { username: 'kai', displayName: 'Kai Klonk', role: 'member', password: 'start-kai' } })
  expect(created.ok).toBe(true)
})

test('IDE: Fehler erklären, Chat mit Kontext, Code übernehmen', async ({ page }) => {
  test.setTimeout(150_000)
  test.skip(!canSignLicense || STACK, 'Braucht Lizenz und den Test-Endpunkt')
  await loginWithPassword(page, `${APP_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
  await page.evaluate(() => localStorage.setItem('klonk:program', JSON.stringify({
    language: 'javascript',
    programs: { javascript: { source: 'import { Klonk } from \'klonk\'\nconst klonk = new Klonk()\nklonk.step(50)\n', breakpoints: [] } },
  })))
  // Die App merkt sich die Lizenz bis zu 60 s – warten, bis die frisch aktivierte gilt
  await expect.poll(() => page.evaluate(() => fetch('/api/ai/config').then(r => r.json()).then(c => c.enabled)), { timeout: 75_000, intervals: [2000] }).toBe(true)
  await gotoHydrated(page, APP_URL)
  await expect(page.getByTestId('code-editor')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })

  // Laufzeitfehler ⇒ „Fehler erklären“ fragt mit Code, API-Referenz und Fehlermeldung im Kontext
  await page.getByTestId('run').click()
  await expect(page.getByTestId('run-error')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('run-error').getByRole('button', { name: 'Fehler erklären' }).click()
  const chat = page.getByTestId('ai-chat')
  await expect(chat.getByTestId('ai-mode')).toHaveText('Volle Hilfe')
  await expect(chat.getByTestId('ai-message-user')).toContainText('Erkläre mir den Fehler')
  await expect(chat.getByTestId('ai-message-assistant')).toContainText('Viel Erfolg!')
  await expect(chat.getByTestId('ai-code')).toContainText('klonk.step(2)')
  // Markdown ohne HTML: Fettdruck als eigenes Element
  await expect(chat.locator('strong', { hasText: 'Schleife' })).toBeVisible()

  // Server setzt den Systemprompt (volle Hilfe für Admins) und fragt den Verbrauch mit ab
  const system = llm!.requests.at(-1)!.messages[0]!
  expect(llm!.requests.at(-1)!.model).toBe('mock-model')
  expect(llm!.requests.at(-1)!.stream_options).toEqual({ include_usage: true })
  expect(system.role).toBe('system')
  expect(system.content).toContain('Du darfst vollständigen Code schreiben')
  expect(system.content).toContain('  3 | klonk.step(50)')
  expect(system.content).toContain('klonk.turnLeft()')
  expect(system.content).toMatch(/Last error in line 3/)

  // Nachfrage mit Verlauf
  const input = chat.getByRole('textbox', { name: 'Frage an den KI-Assistenten' })
  await input.fill('Und wie gehe ich zwei Schritte?')
  await input.press('Enter')
  await expect(chat.getByTestId('ai-message-assistant')).toHaveCount(2)
  await expect(chat.getByTestId('ai-message-assistant').last()).toContainText('Viel Erfolg!')
  const messages = llm!.requests.at(-1)!.messages
  expect(messages.slice(1).map(m => m.role)).toEqual(['user', 'assistant', 'user'])
  expect(messages[2]!.content).toBe(MOCK_ANSWER)

  // Codeblock übernehmen ersetzt das Programm
  await chat.getByTestId('ai-replace').last().click()
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('klonk.step(2)')
  await expect(page.locator('.monaco-editor .view-lines')).not.toContainText('step(50)')
})

test('IDE: Lernende bekommen nur Hinweise', async ({ browser }) => {
  test.skip(!canSignLicense || STACK, 'Braucht Lizenz und den Test-Endpunkt')
  const context = await browser.newContext({ locale: 'de-DE' })
  const page = await context.newPage()
  await loginWithPassword(page, `${APP_URL}/login`, 'kai@gym-muster.de', 'start-kai')
  await changePassword(page, 'start-kai', 'kai-geheim')
  await gotoHydrated(page, APP_URL)
  await page.getByTestId('tab-ai').click()
  const chat = page.getByTestId('ai-chat')
  await expect(chat.getByTestId('ai-mode')).toHaveText('Tipp-Modus')

  await chat.getByRole('textbox', { name: 'Frage an den KI-Assistenten' }).fill('Gib mir die Lösung')
  await chat.getByTestId('ai-send').click()
  await expect(chat.getByTestId('ai-message-assistant')).toContainText('Viel Erfolg!')
  expect(llm!.requests.at(-1)!.messages[0]!.content).toContain('Du bist ein Tutor')
  // Kein Übernehmen im Tipp-Modus
  await expect(chat.getByTestId('ai-replace')).toHaveCount(0)
  await context.close()
})

test('Verwaltung: Tageslimit für Lernende und Verbrauch', async ({ browser, page }) => {
  test.skip(!canSignLicense || STACK, 'Braucht Lizenz und den Test-Endpunkt')
  await loginWithPassword(page, `${ADMIN_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
  await gotoHydrated(page, `${ADMIN_URL}/organization/ai`)
  await page.getByRole('spinbutton', { name: 'Anfragen pro Tag (Lernende)' }).fill('1')
  await page.getByTestId('ai-save').click()
  await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible()

  // Verbrauch ohne Inhalte: drei Anfragen (zwei vom Admin, eine von Kai) mit den Tokens des Anbieters
  const usage = page.getByTestId('ai-usage')
  await expect(usage.getByTestId('ai-usage-requests')).toHaveText('3')
  await expect(usage.getByTestId('ai-usage-inputTokens')).toHaveText('3.000')
  await expect(usage.getByTestId('ai-usage-users')).toContainText('Kai Klonk')

  // Kai hat heute schon gefragt ⇒ weiter im Browser
  const context = await browser.newContext({ locale: 'de-DE' })
  const student = await context.newPage()
  await loginWithPassword(student, `${APP_URL}/login`, 'kai@gym-muster.de', 'kai-geheim')
  await gotoHydrated(student, APP_URL)
  await student.getByTestId('tab-ai').click()
  await expect(student.getByTestId('ai-notice')).toContainText('Tageslimit')
  await expect(student.getByTestId('ai-chat')).toContainText('läuft auf diesem Gerät')
  const chat = await browserFetch(student, '/api/ai/chat', { method: 'POST', body: { messages: [{ role: 'user', content: 'Hallo' }] } })
  expect(chat.status).toBe(409)
  await context.close()
})

test('Eigener Anbieter: Anthropic (Claude) direkt angebunden', async ({ page }) => {
  test.skip(!canSignLicense || STACK, 'Braucht Lizenz und den Test-Endpunkt')
  await loginWithPassword(page, `${ADMIN_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
  await gotoHydrated(page, `${ADMIN_URL}/organization/ai`)
  await page.getByTestId('ai-preset').click()
  await page.getByRole('option', { name: 'Anthropic (Claude)' }).click()
  await expect(page.getByLabel('API-Adresse')).toHaveValue('https://api.anthropic.com/v1')
  await page.getByLabel('API-Adresse').fill(llm!.url)
  await page.getByRole('textbox', { name: 'Modell' }).fill('claude-mock')
  await page.getByTestId('ai-test').click()
  await expect(page.getByText('Verbindung erfolgreich', { exact: true })).toBeVisible()
  await page.getByTestId('ai-save').click()
  await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible()

  await gotoHydrated(page, APP_URL)
  const answer = await page.evaluate(() => fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Hallo Claude' }], locale: 'de' }),
  }).then(r => r.text()))
  expect(answer).toBe(MOCK_ANSWER)
  const request = llm!.requests.at(-1)!
  expect(request.path).toBe('/v1/messages')
  expect(request.model).toBe('claude-mock')
  expect(request.system).toContain('Du darfst vollständigen Code schreiben')
  expect(request.messages).toEqual([{ role: 'user', content: 'Hallo Claude' }])
})

test('Gehostete Plattform: Klonk-KI mit Credits, danach WebLLM', async ({ page }) => {
  test.setTimeout(240_000)
  test.skip(!canSignLicense || STACK, 'Braucht Lizenz und den Test-Endpunkt')
  const features = ['oidc', 'characters', 'models', 'libraries', 'ai']
  await loginWithPassword(page, `${ADMIN_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
  const setInstance = async (hosted: boolean) => {
    const token = await signLicense({ name: 'Gymnasium Musterstadt', maxUsers: 100, features: hosted ? [...features, 'hosted'] : features })
    expect((await browserFetch(page, `${ADMIN_URL}/api/admin/license/instance`, { method: 'PUT', body: { token } })).ok).toBe(true)
  }

  try {
    await gotoHydrated(page, `${ADMIN_URL}/organization/ai`)
    await setInstance(true)
    // Abo der Schule mit KI-Paket: 100 Credits im Monat (eine Anfrage kostet hier 105)
    const orgToken = await signLicense({ name: 'Gymnasium Musterstadt', features, aiCredits: 100 })
    expect((await browserFetch(page, `${ADMIN_URL}/api/admin/license/organization`, { method: 'PUT', body: { token: orgToken } })).ok).toBe(true)

    await gotoHydrated(page, `${ADMIN_URL}/organization/ai`)
    await page.getByLabel('Klonk-KI (über Klonk abgerechnet)').check()
    const platform = page.getByTestId('ai-platform')
    await expect(platform.getByTestId('ai-quota')).toContainText('Diesen Monat: 0 von 100 Credits')
    await expect(platform.getByTestId('ai-platform-models')).toContainText('Klonk Mini')
    // Teures Modell standardmäßig nur für Lehrkräfte
    await expect(platform.getByRole('combobox', { name: 'Freigabe für Klonk Pro' })).toContainText('Nur Lehrkräfte')
    await page.getByTestId('ai-save').click()
    await expect(page.getByText('Gespeichert', { exact: true })).toBeVisible()

    // Die App merkt sich die Instanz-Lizenz bis zu 60 s
    await gotoHydrated(page, APP_URL)
    const config = () => page.evaluate(() => fetch('/api/ai/config').then(r => r.json()))
    await expect.poll(async () => (await config()).platform, { timeout: 75_000, intervals: [2000] }).toBe(true)
    expect((await config()).models.map((m: { label: string }) => m.label)).toEqual(['Klonk Mini', 'Klonk Pro'])

    await gotoHydrated(page, APP_URL)
    await page.getByTestId('tab-ai').click()
    const chat = page.getByTestId('ai-chat')
    await expect(chat.getByTestId('ai-model')).toContainText('Klonk Mini')
    await chat.getByRole('textbox', { name: 'Frage an den KI-Assistenten' }).fill('Was macht mein Programm?')
    await chat.getByTestId('ai-send').click()
    await expect(chat.getByTestId('ai-message-assistant')).toContainText('Viel Erfolg!')
    expect(llm!.requests.at(-1)!.model).toBe('mock-platform')

    // Kontingent aufgebraucht ⇒ hartes Limit, weiter kostenlos im Browser
    await expect(chat.getByTestId('ai-notice')).toContainText('Credits deiner Organisation sind aufgebraucht')
    expect((await config()).mode).toBe('webllm')

    await gotoHydrated(page, `${ADMIN_URL}/organization/ai`)
    await expect(page.getByTestId('ai-quota-empty')).toBeVisible()
    await expect(page.getByTestId('ai-usage').getByTestId('ai-usage-credits')).toHaveText('105')
  }
  finally {
    await setInstance(false)
  }
})
