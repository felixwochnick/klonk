import { expect, test } from '@playwright/test'
import { APP_URL } from '../playwright.config'
import { loginWithPassword } from './utils'

// Lokaler Testmodus: auf localhost/*.localhost alles frei – aber nur, wenn auch der Browser einen lokalen
// Hostnamen meldet (ein vorgeschalteter Proxy mit Host: localhost allein reicht nicht).
test.use({ locale: 'de-DE', extraHTTPHeaders: {} })

test('Lokaler Testmodus schaltet alles frei und ist sichtbar', async ({ page }) => {
  await loginWithPassword(page, `${APP_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
  const license = await page.evaluate(() => fetch('/api/license', { headers: { 'x-klonk-host': location.hostname } }).then(r => r.json()))
  expect(license).toMatchObject({ plan: 'local', maxUsers: null })
  await expect(page.getByTestId('local-badge')).toBeVisible()
  expect(license.features).toEqual(expect.arrayContaining(['libraries', 'models', 'characters']))

  // Ohne bzw. mit fremdem Browser-Hostnamen gilt die normale Lizenz
  const spoofed = await page.evaluate(() => fetch('/api/license', { headers: { 'x-klonk-host': 'schule.example.org' } }).then(r => r.json()))
  expect(spoofed.plan).not.toBe('local')
  const missing = await page.evaluate(() => fetch('/api/license').then(r => r.json()))
  expect(missing.plan).not.toBe('local')
})
