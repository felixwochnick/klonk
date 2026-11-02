import { expect, test, type Page } from '@playwright/test'
import { APP_URL } from '../playwright.config'
import { gotoHydrated, loginWithPassword } from './utils'

// Blockprogrammierung: Blöcke ⇒ Klonk-Script, Ausführung, Debugger am Block, Sprachen.
test.use({ locale: 'de-DE', viewport: { width: 1400, height: 900 } })

const WORLD = {
  version: 1,
  size: { width: 5, depth: 5, height: 4 },
  cells: [],
  characters: [{ id: 'klonk', model: 'diverse', x: 0, z: 0, direction: 'south' }],
}

/** Schleife „wiederhole solange nicht istWand: schritt“, danach „markieren“ */
const LOOP = {
  blocks: {
    languageVersion: 0,
    blocks: [{
      type: 'klonk_repeat_while',
      id: 'loop',
      x: 40,
      y: 40,
      fields: { MODE: 'while' },
      inputs: {
        COND: { block: { type: 'logic_negate', id: 'not', inputs: { BOOL: { block: { type: 'klonk_is_wall', id: 'wall' } } } } },
        DO: { block: { type: 'klonk_step', id: 'step' } },
      },
      next: { block: { type: 'klonk_mark', id: 'mark', fields: { COLOR: 'yellow' } } },
    }],
  },
}

async function openBlocks(page: Page, workspace: object) {
  await page.evaluate(({ workspace, world }) => {
    localStorage.setItem('klonk:program', JSON.stringify({ language: 'blocks', programs: { blocks: { source: JSON.stringify(workspace), breakpoints: [] } } }))
    localStorage.setItem('klonk:world', JSON.stringify(world))
  }, { workspace, world: WORLD })
  await gotoHydrated(page, `${APP_URL}/`)
  await expect(page.getByTestId('blocks-editor')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
  await expect(page.getByTestId('world-view')).toHaveAttribute('data-ready', 'true', { timeout: 15_000 })
}

const state = (page: Page) => page.getByTestId('run-state')
const block = (page: Page, id: string) => page.locator(`[data-id="${id}"]`).first()

test.beforeEach(async ({ page }) => {
  await loginWithPassword(page, `${APP_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
})

test('Blöcke werden zu Klonk-Script und laufen', async ({ page }) => {
  await openBlocks(page, LOOP)
  await page.getByTestId('toggle-code').click()
  await expect(page.getByTestId('generated-code')).toHaveText(/wiederhole solange nicht istWand\s*schritt\s*ende\s*markieren\(gelb\)/)

  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 30_000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'test-results/editor-blocks-done.png' })
})

test('Block aus dem Werkzeugkasten ziehen – Auswahl bleibt offen', async ({ page }) => {
  await openBlocks(page, LOOP)
  await page.getByTestId('toggle-code').click()
  // Die erste Kategorie ist beim Start geöffnet
  await expect(page.getByRole('treeitem', { name: 'Bewegung' })).toHaveAttribute('aria-selected', 'true')
  const flyoutBlock = page.locator('.blocklyFlyout .blocklyDraggable').filter({ hasText: 'linksDrehen' }).first()
  await expect(flyoutBlock).toBeVisible()
  const target = await page.getByTestId('blocks-editor').boundingBox()
  await flyoutBlock.dragTo(page.getByTestId('blocks-editor'), { targetPosition: { x: target!.width - 200, y: target!.height - 150 } })
  await expect(page.getByTestId('generated-code')).toContainText('linksDrehen')
  await expect(flyoutBlock).toBeVisible()
  await page.screenshot({ path: 'test-results/editor-blocks-toolbox.png' })
})

test('Haltepunkt per Rechtsklick, Hervorhebung, Weiter', async ({ page }) => {
  await openBlocks(page, LOOP)
  await block(page, 'mark').click({ button: 'right', position: { x: 15, y: 10 } })
  await page.getByText('Haltepunkt setzen', { exact: true }).click()
  await expect(page.locator('.klonk-block-breakpoint')).toHaveCount(1)

  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'paused', { timeout: 30_000 })
  // Der angehaltene Block ist hervorgehoben
  await expect(page.locator(`[data-id="mark"] > .blocklyPath`).first()).toBeVisible()
  await expect(page.locator('.blocklyPathLight, .blocklyHighlighted, [data-id="mark"].blocklySelected, .blocklyHighlightedConnectionPath').first()).toBeAttached()

  await page.getByTestId('resume').click()
  await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 15_000 })
})

test('Fehler wird am Block markiert', async ({ page }) => {
  await openBlocks(page, {
    blocks: {
      languageVersion: 0,
      blocks: [{
        type: 'klonk_repeat_times',
        id: 'loop',
        x: 40,
        y: 40,
        inputs: {
          TIMES: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
          DO: { block: { type: 'klonk_step', id: 'step' } },
        },
      }],
    },
  })
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'error', { timeout: 30_000 })
  await expect(page.getByTestId('run-error')).toContainText('Da ist eine Wand')
  await expect(page.locator('[data-id="step"].klonk-block-error')).toHaveCount(1)
})

test('Blöcke sprechen die UI-Sprache', async ({ page }) => {
  await openBlocks(page, LOOP)
  await expect(page.locator('.blocklyText').filter({ hasText: 'wiederhole' }).first()).toBeVisible()
  // Sprache über die Einstellungen (Kontomenü) wechseln und zurück in die IDE
  await page.getByTestId('user-menu').click()
  await page.getByRole('menuitem', { name: 'Einstellungen' }).click()
  await page.getByTestId('settings-language').click()
  await page.getByRole('option', { name: 'English' }).click()
  await page.getByRole('link', { name: 'Code' }).click()
  await expect(page.locator('.blocklyText').filter({ hasText: 'repeat' }).first()).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('toggle-code').click()
  await expect(page.getByTestId('generated-code')).toHaveText(/repeat while not isWall\s*step\s*end\s*setMark\(yellow\)/)
})

test('Variablen, eigene Blöcke und Bedingungen', async ({ page }) => {
  const num = (n: number) => ({ block: { type: 'math_number', fields: { NUM: n } } })
  const get = { block: { type: 'variables_get', fields: { VAR: { id: 'v1' } } } }
  await openBlocks(page, {
    variables: [{ name: 'zähler', id: 'v1' }],
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'variables_set',
          x: 20,
          y: 20,
          fields: { VAR: { id: 'v1' } },
          inputs: { VALUE: num(0) },
          next: { block: {
            type: 'klonk_repeat_times',
            inputs: { TIMES: num(3), DO: { block: { type: 'math_change', fields: { VAR: { id: 'v1' } }, inputs: { DELTA: num(2) } } } },
            next: { block: { type: 'procedures_callnoreturn', extraState: { name: 'zeige wert' } } },
          } },
        },
        {
          type: 'procedures_defnoreturn',
          x: 20,
          y: 320,
          fields: { NAME: 'zeige wert' },
          inputs: { STACK: { block: {
            type: 'controls_if',
            inputs: {
              IF0: { block: { type: 'logic_compare', fields: { OP: 'GT' }, inputs: { A: get, B: num(5) } } },
              DO0: { block: { type: 'klonk_print', inputs: { VALUE: { block: { type: 'klonk_join', inputs: { A: { block: { type: 'text', fields: { TEXT: 'Zähler: ' } } }, B: get } } } } } },
            },
          } } },
        },
      ],
    },
  })
  await page.getByTestId('toggle-code').click()
  await expect(page.getByTestId('generated-code')).toContainText('var zähler = 0')
  await expect(page.getByTestId('generated-code')).toContainText('anweisung zeige_wert')
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 30_000 })
  await expect(page.getByTestId('output')).toHaveText('Zähler: 6')
})
