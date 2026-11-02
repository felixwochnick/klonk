import { expect, test, type Page } from '@playwright/test'
import { APP_URL } from '../playwright.config'
import { canSignLicense } from './license'
import { gotoHydrated, loginWithPassword } from './utils'

// Figuren erstellen/wechseln, Namen über den Figuren, eigene Designs (Lizenz aus admin-license.spec.ts).
test.use({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })

const WORLD = { version: 1, size: { width: 5, depth: 5, height: 3 }, cells: [], characters: [{ id: 'Klonk', model: 'male', x: 0, z: 0, direction: 'south' }] }
const state = (page: Page) => page.getByTestId('run-state')

test.beforeEach(async ({ page }) => {
  test.skip(!canSignLicense, 'Mehrere Figuren und Designs brauchen eine Lizenz')
  test.setTimeout(120_000)
  await loginWithPassword(page, `${APP_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
  // Der App-Server hält die Lizenz bis zu 60 s im Cache – auf die in admin-license.spec.ts aktivierte warten
  await expect.poll(() => page.evaluate(() => fetch('/api/license').then(r => r.json()).then(l => l.features as string[])), { timeout: 70_000, intervals: [2_000] })
    .toEqual(expect.arrayContaining(['characters', 'models']))
})

test('Klonk-Script: erstelle und wechsle, Namen über den Figuren', async ({ page }) => {
  await page.evaluate((world) => {
    localStorage.setItem('klonk:program', JSON.stringify({ language: 'klonk', programs: { klonk: { source: 'erstelle("Kim", "weiblich", 3, 1)\nschritt\nwechsle("Klonk")\nschritt\nausgabe(positionY)', breakpoints: [] } } }))
    localStorage.setItem('klonk:world', JSON.stringify(world))
  }, WORLD)
  await gotoHydrated(page, `${APP_URL}/`)
  await expect(page.getByTestId('world-view')).toHaveAttribute('data-ready', 'true', { timeout: 15_000 })
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 30_000 })
  await expect(page.getByTestId('output')).toHaveText('2')
  await page.waitForTimeout(1200)
  await page.getByTestId('world-view').screenshot({ path: 'test-results/characters-names.png' })
})

test('Eigenes Design: visueller Editor, im Welt-Editor setzen, im Programm erstellen', async ({ page }) => {
  await gotoHydrated(page, `${APP_URL}/`)
  await page.evaluate(async (world) => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('klonk-projects', { create: true })
    await root.removeEntry('Designs', { recursive: true }).catch(() => {})
    const dir = await root.getDirectoryHandle('Designs', { create: true })
    const write = async (name: string, text: string) => {
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable()
      await w.write(text)
      await w.close()
    }
    await write('klonk.json', '{ "language": "klonk" }')
    await write('main.klonk', 'erstelle("Robo", "ritter")\nschritt\nausgabe(positionY)\n')
    await write('welt.klonkworld.json', JSON.stringify(world))
  }, WORLD)
  await page.reload()
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' })
  await page.getByTestId('toggle-project').click()
  await page.getByTestId('browser-project-Designs').click()

  // Neues Design ⇒ öffnet den visuellen Editor
  await page.getByTestId('new-file').click()
  await page.getByRole('menuitem', { name: 'Roboter-Design' }).click()
  await page.getByTestId('project-dialog-name').fill('ritter')
  await page.getByTestId('project-dialog-submit').click()
  await expect(page.getByTestId('design-editor')).toBeVisible()
  await expect(page.getByTestId('design-license')).toHaveCount(0)
  await page.getByTestId('design-color-shirt').evaluate((input: HTMLInputElement) => {
    input.value = '#aa0000'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.getByTestId('design-accessory').click()
  await page.getByRole('option', { name: 'Krone' }).click()
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 5_000 })
  await page.waitForTimeout(800)
  await page.getByTestId('design-editor').screenshot({ path: 'test-results/design-editor.png' })

  // Im Programm verwenden
  await page.getByTestId('file-main.klonk').click()
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 30_000 })
  await expect(page.getByTestId('output')).toHaveText('2')
  await page.waitForTimeout(800)
  await page.getByTestId('world-view').screenshot({ path: 'test-results/design-in-world.png' })

  // Im Welt-Editor als Aussehen wählbar
  await page.getByRole('link', { name: 'Welt', exact: true }).click()
  await expect(page).toHaveURL(`${APP_URL}/world`)
  await page.getByRole('button', { name: 'Figur' }).click()
  await page.getByTestId('character-look').click()
  await expect(page.getByRole('option', { name: 'Roboter-Design: ritter' })).toBeVisible()
})

test('Programm speichert ein Design ins Projekt', async ({ page }) => {
  await gotoHydrated(page, `${APP_URL}/`)
  await page.evaluate(async (world) => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('klonk-projects', { create: true })
    await root.removeEntry('DesignCode', { recursive: true }).catch(() => {})
    const dir = await root.getDirectoryHandle('DesignCode', { create: true })
    const write = async (name: string, text: string) => {
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable()
      await w.write(text)
      await w.close()
    }
    await write('klonk.json', '{ "language": "javascript" }')
    await write('main.js', 'import { Klonk, loadDesign, saveDesign } from "klonk"\nconst d = JSON.parse(loadDesign("ritter"))\nd.colors.shirt = "#00aa00"\nd.accessory = "hat"\nsaveDesign("jaeger", d)\nKlonk.create("Robin", "jaeger").step()\n')
    await write('ritter.klonkdesign.json', JSON.stringify({ version: 1, base: 'male', colors: { skin: '#e8b48a', shirt: '#aa0000', pants: '#333333', hair: '#222222', eyes: '#111111' }, accessory: 'helmet' }))
    await write('welt.klonkworld.json', JSON.stringify(world))
  }, WORLD)
  await page.reload()
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' })
  await page.getByTestId('toggle-project').click()
  await page.getByTestId('browser-project-DesignCode').click()
  await expect(page.getByTestId('code-editor')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 30_000 })
  await expect(page.getByTestId('file-jaeger.klonkdesign.json')).toBeVisible()
  await page.getByTestId('file-jaeger.klonkdesign.json').click()
  await expect(page.getByTestId('design-accessory')).toContainText('Hut')
})
