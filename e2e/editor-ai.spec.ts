import { expect, test } from '@playwright/test'
import { ADMIN_URL, APP_URL } from '../playwright.config'
import { canSignLicense } from './license'
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

test('Verwaltung: eigenes Sprachmodell einrichten', async ({ page }) => {
  test.skip(!canSignLicense, 'Kein Signierschlüssel für diese Testumgebung')
  await loginWithPassword(page, `${ADMIN_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
  await gotoHydrated(page, `${ADMIN_URL}/organization/ai`)
  await expect(page.getByTestId('ai-locked')).toHaveCount(0)

  await page.getByLabel('Eigener Server (OpenAI-kompatibel)').check()
  await page.getByLabel('API-Adresse').fill(llm?.url ?? 'http://llm.invalid/v1')
  await page.getByLabel('Modell').fill('mock-model')
  await page.getByLabel('API-Schlüssel').fill('test-key')
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
  await expect(page.getByLabel('API-Schlüssel')).toHaveValue('')
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

  // Server setzt den Systemprompt (volle Hilfe für Admins)
  const system = llm!.requests.at(-1)!.messages[0]!
  expect(llm!.requests.at(-1)!.model).toBe('mock-model')
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
