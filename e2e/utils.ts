import type { Page } from '@playwright/test'

export async function gotoHydrated(page: Page, url: string) {
  await page.goto(url)
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' })
}
