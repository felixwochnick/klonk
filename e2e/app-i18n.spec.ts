import { expect, test } from '@playwright/test'
import { APP_URL } from '../playwright.config'
import { gotoHydrated } from './utils'

test('Login-Seite folgt der Browsersprache', async ({ browser }) => {
  const de = await browser.newPage({ locale: 'de-DE' })
  await gotoHydrated(de, APP_URL + '/login')
  await expect(de.getByRole('heading', { level: 1 })).toHaveText('Anmelden')

  const en = await browser.newPage({ locale: 'en-US' })
  await gotoHydrated(en, APP_URL + '/login')
  await expect(en.getByRole('heading', { level: 1 })).toHaveText('Sign in')
})

test('Sprache lässt sich umschalten', async ({ browser }) => {
  const page = await browser.newPage({ locale: 'en-US' })
  await gotoHydrated(page, APP_URL + '/login')
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Deutsch' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Anmelden')

  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Anmelden')
})
