import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { APP_URL } from '../playwright.config'
import { gotoHydrated, loginWithPassword } from './utils'

// Diagramme: Struktogramm (Klonk-Script), Objektdiagramm beim Anhalten (JS, Python), Klassendiagramm über das Projekt (Java)
// und mit Roslyn (C#), ER-Diagramm einer Datenbank in drei Darstellungen + Relationenschema, Export als SVG
test.use({ locale: 'de-DE', viewport: { width: 1500, height: 950 } })
test.describe.configure({ mode: 'serial' })

const WORLD = { version: 1, size: { width: 6, depth: 6, height: 4 }, cells: [], characters: [{ id: 'klonk', model: 'female', x: 0, z: 0, direction: 'south' }] }

async function openIde(page: Page, language: string, source: string, breakpoints: number[] = []) {
  await page.evaluate(({ language, source, breakpoints, world }) => {
    localStorage.setItem('klonk:program', JSON.stringify({ language, programs: { [language]: { source, breakpoints } } }))
    localStorage.setItem('klonk:world', JSON.stringify(world))
    localStorage.removeItem('klonk:diagram-view')
  }, { language, source, breakpoints, world: WORLD })
  await gotoHydrated(page, `${APP_URL}/`)
  await expect(page.getByTestId('code-editor')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
}

/** Browser-Projekt im OPFS anlegen und in der IDE öffnen */
async function openProject(page: Page, name: string, files: Record<string, string>) {
  await gotoHydrated(page, `${APP_URL}/`)
  await page.evaluate(async ({ name, files }) => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('klonk-projects', { create: true })
    await root.removeEntry(name, { recursive: true }).catch(() => {})
    let dir = await root.getDirectoryHandle(name, { create: true })
    for (const [path, text] of Object.entries(files)) {
      const parts = path.split('/')
      dir = await root.getDirectoryHandle(name)
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true })
      const w = await (await dir.getFileHandle(parts.at(-1)!, { create: true })).createWritable()
      await w.write(text)
      await w.close()
    }
  }, { name, files })
  await page.reload()
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' })
  await page.getByTestId('toggle-project').click()
  await page.getByTestId(`browser-project-${name}`).click()
  await expect(page.getByTestId('project-name')).toHaveText(name)
}

async function showDiagram(page: Page, view: 'Struktogramm' | 'Klassendiagramm' | 'Objektdiagramm') {
  if (await page.getByTestId('diagram-panel').count() === 0) await page.getByTestId('tab-diagrams').click()
  await page.getByTestId('diagram-views').getByRole('tab', { name: view }).click()
}
const svg = (page: Page) => page.getByTestId('diagram').locator('svg')
const state = (page: Page) => page.getByTestId('run-state')

test.beforeEach(async ({ page }) => {
  test.setTimeout(180_000)
  await loginWithPassword(page, `${APP_URL}/login`, 'admin@gym-muster.de', 'admin-passwort')
})

test('Struktogramm aus Klonk-Script: Schleife, Verzweigung, Aufruf; einzelnes Unterprogramm; Export als SVG', async ({ page }) => {
  await openIde(page, 'klonk', `wiederhole 3 mal
  schritt
  wenn istWand dann
    linksDrehen
  sonst
    hinlegen(rot)
  ende
ende
quadrat()
anweisung quadrat()
  wiederhole 4 mal
    linksDrehen
  ende
ende`)
  await showDiagram(page, 'Struktogramm')
  await expect(svg(page)).toHaveAttribute('data-diagram', 'structogram')
  await expect(svg(page)).toContainText('Hauptprogramm')
  await expect(svg(page)).toContainText('wiederhole 3 mal')
  await expect(svg(page)).toContainText('wahr')
  await expect(svg(page).locator('[data-kind="if"]')).toHaveCount(1)
  await expect(svg(page).locator('[data-kind="call"]')).toContainText('quadrat()')
  await expect(svg(page)).toContainText('anweisung quadrat()')
  await page.screenshot({ path: 'test-results/diagrams-structogram.png' })

  // Nur ein Unterprogramm
  await page.getByTestId('diagram-routine').click()
  await page.getByRole('option', { name: 'quadrat' }).click()
  await expect(svg(page)).not.toContainText('Hauptprogramm')
  await expect(svg(page)).toContainText('wiederhole 4 mal')

  // Klonk-Script hat keine Klassen
  await showDiagram(page, 'Klassendiagramm')
  await expect(page.getByTestId('diagram-empty')).toContainText('keine Klassen')

  // Export (immer hell, als Datei)
  await showDiagram(page, 'Struktogramm')
  await page.getByTestId('diagram-export').click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Als SVG herunterladen' }).click()])
  expect(download.suggestedFilename()).toBe('programm-struktogramm.svg')
  const text = readFileSync(await download.path(), 'utf8')
  expect(text).toContain('<svg')
  expect(text).toContain('wiederhole 4 mal')

  // Beim Ausführen bleibt der Diagramm-Tab offen
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', /done|error/, { timeout: 30_000 })
  await expect(page.getByTestId('diagram-panel')).toBeVisible()
})

test('Objektdiagramm beim Anhalten (JavaScript): Objekte, Verweise, Liste, Figur mit Lage; Klassendiagramm', async ({ page }) => {
  await openIde(page, 'javascript', `import { Klonk } from 'klonk'
class Held {
  constructor(name) {
    this.name = name
    this.figur = new Klonk()
    this.freund = null
  }
}
const klara = new Held('Klara')
const ben = new Held('Ben')
klara.freund = ben
ben.freund = klara
const team = [klara, ben]
console.log(team.length)
`, [14])
  await showDiagram(page, 'Objektdiagramm')
  await expect(page.getByTestId('diagram-empty')).toContainText('Haltepunkt')
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'paused', { timeout: 30_000 })
  await expect(svg(page)).toHaveAttribute('data-diagram', 'objects')
  await expect(svg(page)).toContainText('klara : Held')
  await expect(svg(page)).toContainText('ben : Held')
  await expect(svg(page)).toContainText('team : Array')
  await expect(svg(page)).toContainText('name = "Klara"')
  await expect(svg(page)).toContainText(': Klonk')
  await expect(svg(page)).toContainText('direction = "south"')
  await page.screenshot({ path: 'test-results/diagrams-objects.png' })

  await showDiagram(page, 'Klassendiagramm')
  await expect(svg(page).locator('[data-class="Held"]')).toContainText('+ figur: Klonk')
  await expect(svg(page).locator('[data-class="Klonk"]')).toHaveCount(1)

  await page.getByTestId('resume').click()
  await expect(state(page)).toHaveAttribute('data-state', 'done', { timeout: 30_000 })
  await showDiagram(page, 'Objektdiagramm')
  await expect(page.getByTestId('diagram-panel')).toContainText('Stand beim letzten Anhalten')
})

test('Objektdiagramm beim Anhalten (Python)', async ({ page }) => {
  await openIde(page, 'python', `from klonk import Klonk

class Konto:
    def __init__(self, inhaber):
        self.inhaber = inhaber
        self.stand = 0
        self.figur = Klonk()

k = Konto("Mia")
k.stand = 5
print(k.stand)
`, [11])
  await showDiagram(page, 'Objektdiagramm')
  await page.getByTestId('run').click()
  await expect(state(page)).toHaveAttribute('data-state', 'paused', { timeout: 90_000 })
  await expect(svg(page)).toContainText('k : Konto')
  await expect(svg(page)).toContainText('inhaber = \'Mia\'')
  await expect(svg(page)).toContainText('stand = 5')
  await showDiagram(page, 'Klassendiagramm')
  await expect(svg(page).locator('[data-class="Konto"]')).toContainText('+ stand: int')
  await page.getByTestId('stop').click()
})

test('Klassendiagramm über das ganze Java-Projekt, Klick öffnet die Datei', async ({ page }) => {
  await openProject(page, 'Diagramme', {
    'klonk.json': '{ "language": "java" }',
    'src/Main.java': 'import klonk.Klonk;\n\npublic class Main {\n    public static void main(String[] args) {\n        Held held = new Held("Klara");\n        held.bewegen(3);\n    }\n}\n',
    'src/Figur.java': 'public abstract class Figur {\n    protected String name;\n\n    public Figur(String name) {\n        this.name = name;\n    }\n\n    public abstract void bewegen(int schritte);\n}\n',
    'src/Held.java': 'import klonk.Klonk;\nimport java.util.ArrayList;\n\npublic class Held extends Figur {\n    private Klonk klonk = new Klonk();\n    private ArrayList<Held> freunde = new ArrayList<>();\n\n    public Held(String name) {\n        super(name);\n    }\n\n    public void bewegen(int schritte) {\n        for (int i = 0; i < schritte; i++) {\n            if (klonk.isWall()) {\n                klonk.turnLeft();\n            } else {\n                klonk.step();\n            }\n        }\n    }\n}\n',
  })
  await page.getByTestId('file-src/Main.java').click()
  await showDiagram(page, 'Klassendiagramm')
  await expect(svg(page).locator('[data-class="Main"]')).toHaveCount(1)
  await expect(svg(page).locator('[data-class="Held"]')).toHaveCount(0)

  await page.getByTestId('diagram-scope').click()
  await page.getByRole('option', { name: 'Ganzes Projekt' }).click()
  await expect(svg(page).locator('[data-class="Held"]')).toContainText('- freunde: ArrayList<Held>')
  await expect(svg(page).locator('[data-class="Figur"]')).toContainText('«abstract»')
  await expect(svg(page).locator('[data-class="Klonk"]')).toHaveCount(1)
  await page.screenshot({ path: 'test-results/diagrams-classes.png' })

  // Klasse aus einer anderen Datei anklicken ⇒ Datei öffnet sich
  await svg(page).locator('[data-class="Figur"] rect').first().click()
  await expect(page.getByTestId('code-editor')).toContainText('public abstract class Figur', { timeout: 10_000 })

  // Struktogramm der Methode
  await page.getByTestId('file-src/Held.java').click()
  await showDiagram(page, 'Struktogramm')
  await expect(svg(page)).toContainText('Held.bewegen(schritte: int): void')
  await expect(svg(page)).toContainText('for (int i = 0; i < schritte; i++)')
})

test('C#: Klassendiagramm und Struktogramm über Roslyn', async ({ page }) => {
  await openIde(page, 'csharp', `using klonk;

var tier = new Hund("Bello");
tier.Laut();

abstract class Tier
{
    public string Name { get; }
    protected Tier(string name) { Name = name; }
    public abstract void Laut();
}

class Hund : Tier, IComparable<Hund>
{
    private int bellen;
    public Hund(string name) : base(name) { }
    public override void Laut()
    {
        while (bellen < 2) { Console.WriteLine("Wuff"); bellen++; }
    }
    public int CompareTo(Hund? other) => 0;
}`)
  await showDiagram(page, 'Klassendiagramm')
  await expect(svg(page).locator('[data-class="Hund"]')).toContainText('- bellen: int', { timeout: 120_000 })
  await expect(svg(page).locator('[data-class="Tier"]')).toContainText('+ Name: string')
  await expect(svg(page).locator('[data-class="IComparable"]')).toHaveCount(1)
  await showDiagram(page, 'Struktogramm')
  await expect(svg(page)).toContainText('Hund.Laut()')
  await expect(svg(page)).toContainText('while (bellen < 2)')
})

test('ER-Diagramm einer SQLite-Datenbank: Chen, (min,max), Krähenfuß, Relationenschema', async ({ page }) => {
  await openProject(page, 'ER', { 'klonk.json': '{ "language": "python" }', 'main.py': 'print(1)\n' })
  await page.getByTestId('new-file').click()
  await page.getByRole('menuitem', { name: 'Datenbank (SQLite)' }).click()
  await page.getByTestId('project-dialog-name').fill('schule')
  await page.getByTestId('project-dialog-submit').click()
  await expect(page.getByTestId('database-editor')).toBeVisible()
  // Fremdschlüssel in der Tabellenliste
  await expect(page.getByTestId('database-table-schueler').getByLabel('Fremdschlüssel auf klassen')).toBeVisible()

  await page.getByTestId('database-view-er').click()
  const er = page.getByTestId('er-diagram').locator('svg')
  await expect(er).toHaveAttribute('data-diagram', 'er')
  await expect(er.locator('[data-kind="entity"][data-table="schueler"]')).toContainText('vorname')
  await expect(er.locator('[data-kind="relationship"]')).toContainText('klasse')
  await page.screenshot({ path: 'test-results/diagrams-er.png' })

  const notation = async (name: string) => {
    await page.getByTestId('er-notation').click()
    await page.getByRole('option', { name }).click()
  }
  await notation('Chen (min,max)')
  await expect(er).toContainText('(0,1)')
  await expect(er).toContainText('(0,*)')
  await notation('Krähenfuß')
  await expect(er.locator('[data-table="schueler"]')).toContainText('FK')
  await notation('Relationenschema')
  await expect(er).toContainText('↑klasse_id')

  // Tabelle im Diagramm anklicken ⇒ ihre Zeilen in der Konsole
  await notation('Chen (1:n)')
  await er.locator('[data-kind="entity"][data-table="schueler"]').getByText('schueler', { exact: true }).click()
  await expect(page.getByTestId('sql-result')).toContainText('Ali')
})
