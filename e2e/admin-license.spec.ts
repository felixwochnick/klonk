import { expect, test } from '@playwright/test'
import { ADMIN_URL } from '../playwright.config'
import { canSignLicense, signLicense } from './license'
import { browserFetch, gotoHydrated, loginWithPassword } from './utils'

// Kostenlose Version, Nutzergrenze und Aktivierung einer Lizenz. Baut auf admin-accounts.spec.ts auf
// (Ada ist Besitzerin der Instanz); admin-sso.spec.ts braucht danach die aktive Lizenz für OIDC.
test.use({ locale: 'de-DE' })
test.describe.configure({ mode: 'serial' })

test('Kostenlose Version: Grenzen und gesperrtes OIDC', async ({ page }) => {
  await loginWithPassword(page, `${ADMIN_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')

  await gotoHydrated(page, `${ADMIN_URL}/license`)
  await expect(page.getByTestId('license-plan')).toHaveText('Kostenlos')
  await expect(page.getByTestId('license-usage')).toHaveText('3 / 10')
  await expect(page.getByTestId('feature-oidc')).toHaveAttribute('data-enabled', 'false')

  await gotoHydrated(page, `${ADMIN_URL}/organization/login`)
  await expect(page.getByTestId('oidc-locked')).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Single Sign-on (OIDC)' })).toBeDisabled()

  // Auch die API lehnt OIDC ohne Lizenz ab
  const res = await browserFetch(page, `${ADMIN_URL}/api/admin/organization/auth`, {
    method: 'PUT',
    body: {
      localEnabled: true,
      ldapEnabled: false,
      ldap: null,
      oidcEnabled: true,
      oidc: { issuer: 'https://idp.example', clientId: 'x', clientSecret: 'y' },
    },
  })
  expect(res.status).toBe(402)
})

test('Kostenlose Version: höchstens 10 Konten', async ({ page }) => {
  await loginWithPassword(page, `${ADMIN_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')

  // Bis zur Grenze auffüllen (3 vorhanden)
  for (let i = 1; i <= 7; i++) {
    const res = await browserFetch(page, `${ADMIN_URL}/api/admin/users`, {
      method: 'POST',
      body: { username: `extra${i}`, displayName: `Extra ${i}`, role: 'member', password: 'start-extra' },
    })
    expect(res.ok).toBe(true)
  }

  // Das 11. Konto scheitert mit verständlicher Meldung
  await gotoHydrated(page, `${ADMIN_URL}/users`)
  await page.getByRole('button', { name: 'Konto anlegen' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name', { exact: true }).fill('Zu Viel')
  await dialog.getByLabel('Benutzername').fill('zuviel')
  await dialog.getByLabel('Startpasswort').fill('start-zuviel')
  await dialog.getByRole('button', { name: 'Konto anlegen' }).click()
  await expect(page.getByText('Die maximale Anzahl an Konten für diese Lizenz ist erreicht.', { exact: true })).toBeVisible()
  // Der Dialog bleibt für eine Korrektur offen
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  // Aufräumen, damit die folgenden Tests wieder Platz haben
  for (let i = 1; i <= 7; i++) {
    await page.getByRole('button', { name: `Aktionen für Extra ${i}` }).click()
    page.once('dialog', d => d.accept())
    await page.getByRole('menuitem', { name: 'Löschen' }).click()
    await expect(page.getByRole('button', { name: `Aktionen für Extra ${i}` })).toHaveCount(0)
  }
})

test('Self-Hosted: Warnung, Puffer über der Grenze, dann Sperre', async ({ page }) => {
  test.skip(!canSignLicense, 'Kein Signierschlüssel für diese Testumgebung')
  await loginWithPassword(page, `${ADMIN_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
  await gotoHydrated(page, `${ADMIN_URL}/license`)

  // Kleine Grenze, damit der Test schnell an sie stößt (3 Konten vorhanden)
  const token = await signLicense({ name: 'Klein', plan: 'self-hosted', maxUsers: 3, features: [] })
  await page.getByLabel('Lizenz-Token').fill(token)
  await page.getByRole('button', { name: 'Lizenz aktivieren' }).click()
  await expect(page.getByTestId('license-plan')).toContainText('Self-Hosted (bis 1000 Konten)')
  await expect(page.getByTestId('license-usage')).toHaveText('3 / 3')
  await expect(page.getByTestId('user-limit-over')).toContainText('Es können noch 1 Konten angelegt werden')

  // Puffer: ein Konto geht noch, danach gesperrt
  await gotoHydrated(page, `${ADMIN_URL}/users`)
  await expect(page.getByTestId('user-limit-over')).toBeVisible()
  const create = (name: string) => browserFetch(page, `${ADMIN_URL}/api/admin/users`, {
    method: 'POST',
    body: { username: name, displayName: name, role: 'member', password: 'start-puffer' },
  })
  expect((await create('puffer1')).ok).toBe(true)
  expect((await create('puffer2')).status).toBe(402)

  await gotoHydrated(page, `${ADMIN_URL}/users`)
  await expect(page.getByTestId('user-limit-blocked')).toBeVisible()
  await page.getByRole('button', { name: 'Aktionen für puffer1' }).click()
  page.once('dialog', d => d.accept())
  await page.getByRole('menuitem', { name: 'Löschen' }).click()
  await expect(page.getByTestId('user-limit-over')).toBeVisible()
})

test('Lizenz aktivieren schaltet Funktionen frei', async ({ page }) => {
  test.skip(!canSignLicense, 'Kein Signierschlüssel für diese Testumgebung')
  await loginWithPassword(page, `${ADMIN_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
  await gotoHydrated(page, `${ADMIN_URL}/license`)

  // Ungültige Tokens werden gar nicht erst gespeichert
  await page.getByLabel('Lizenz-Token').fill('kein-gültiges-token')
  await page.getByRole('button', { name: 'Lizenz aktivieren' }).click()
  await expect(page.getByText('Das Lizenz-Token ist ungültig.', { exact: true })).toBeVisible()

  const token = await signLicense({ name: 'Gymnasium Musterstadt', maxUsers: 100, features: ['oidc', 'characters', 'models', 'libraries', 'ai'] })
  await page.getByLabel('Lizenz-Token').fill(token)
  await page.getByRole('button', { name: 'Lizenz aktivieren' }).click()
  await expect(page.getByText('Lizenz aktiviert', { exact: true })).toBeVisible()
  await expect(page.getByTestId('license-plan')).toContainText('Schule')
  await expect(page.getByTestId('license-plan')).toContainText('Gymnasium Musterstadt')
  await expect(page.getByTestId('license-usage')).toHaveText('3 / 100')
  await expect(page.getByTestId('feature-oidc')).toHaveAttribute('data-enabled', 'true')

  await gotoHydrated(page, `${ADMIN_URL}/organization/login`)
  await expect(page.getByTestId('oidc-locked')).toHaveCount(0)
})
