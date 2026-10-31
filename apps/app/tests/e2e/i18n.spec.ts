import { expect, test } from '@playwright/test'
import { gotoHydrated } from './utils'

test('Startseite folgt der Browsersprache', async ({ browser }) => {
  const de = await browser.newPage({ locale: 'de-DE' })
  await gotoHydrated(de, '/')
  await expect(de.getByRole('heading', { level: 1 })).toHaveText('Willkommen bei Klonk')

  const en = await browser.newPage({ locale: 'en-US' })
  await gotoHydrated(en, '/')
  await expect(en.getByRole('heading', { level: 1 })).toHaveText('Welcome to Klonk')
})

test('Sprache lässt sich umschalten', async ({ browser }) => {
  const page = await browser.newPage({ locale: 'en-US' })
  await gotoHydrated(page, '/')
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Deutsch' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Willkommen bei Klonk')

  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Willkommen bei Klonk')
})
