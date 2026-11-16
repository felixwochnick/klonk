import { translate } from '@klonk/klonk-script'
import { World } from '@klonk/world'
import { describe, expect, it } from 'vitest'
import { javaOutline, javascriptOutline, pythonOutline } from '@klonk/diagrams'
import { compareOutcome, emptyManifest, expectedOutcomes, findModule, LEARN_MODULES, learnStorages, map, moduleCode, missingCodeConstructs, missingConstructs, missingSqlConstructs, moduleProjectFiles, parseManifest, progressFromFiles, runTrusted, serializeManifest, starterSource, taskFolderFiles, trackModules } from '../src'

describe('Karten', () => {
  it('übersetzt Zeichen in Felder und Figur', () => {
    const world = map(`
      >y 2 #
      .  g .
    `)
    expect(world.size).toEqual({ width: 3, depth: 2, height: 6 })
    expect(world.characters).toEqual([{ id: 'Klonk', model: 'male', x: 0, z: 0, direction: 'east' }])
    expect(world.cells).toEqual([
      { x: 0, z: 0, mark: 'yellow' },
      { x: 1, z: 0, bricks: ['red', 'red'] },
      { x: 2, z: 0, block: true },
      { x: 1, z: 1, mark: 'green' },
    ])
  })

  it('verlangt so viele Figuren wie Namen, farbige Ziegel', () => {
    expect(() => map('. .')).toThrow()
    expect(() => map('> >')).toThrow()
    const world = map('> RB2 <', { names: ['Klonk', 'Klara'] })
    expect(world.characters.map(c => [c.id, c.model, c.x])).toEqual([['Klonk', 'male', 0], ['Klara', 'female', 2]])
    expect(world.cells).toEqual([{ x: 1, z: 0, bricks: ['red', 'blue', 'red', 'red'] }])
  })
})

describe('Prüfung', () => {
  const start = map('> . . y')
  const check = { position: true, cells: true, output: 'numbers' as const }

  it('meldet Position, Felder und Ausgabe', async () => {
    const expected = await runTrusted('schritt(3)\nmarkieren(rot)\nausgabe(3)', start)
    expect(compareOutcome(check, expected, await runTrusted('schritt(2)', start)))
      .toEqual({ code: 'position', name: 'Klonk', x: 3, y: 1, expectedX: 4, expectedY: 1 })
    expect(compareOutcome(check, expected, await runTrusted('schritt(3)', start)))
      .toEqual({ code: 'cell', x: 4, y: 1 })
    expect(compareOutcome(check, expected, await runTrusted('schritt(3)\nmarkieren(rot)\nausgabe("Es sind 4")', start)))
      .toEqual({ code: 'output', expected: '3', actual: '4' })
    expect(compareOutcome(check, expected, await runTrusted('schritt(3)\nmarkieren(rot)\nausgabe("Ergebnis: 3.0")', start))).toBeNull()
  })

  it('prüft alle Figuren, auch neu erstellte', async () => {
    const start = map('> . . .\n. . . .')
    const expected = await runTrusted('erstelle("Klara", "weiblich", 1, 2)\nschritt(2)', start)
    expect(compareOutcome({ position: true }, expected, await runTrusted('', start))).toEqual({ code: 'character_missing', name: 'Klara' })
    expect(compareOutcome({ position: true }, expected, await runTrusted('erstelle("klara", "weiblich", 1, 2)\nschritt', start)))
      .toEqual({ code: 'position', name: 'Klara', x: 2, y: 2, expectedX: 3, expectedY: 2 })
  })

  it('vergleicht Ausgabezeilen, SQL-Ergebnisse, Tabellen und Schema', () => {
    const none = { world: null, output: [] }
    expect(compareOutcome({ output: 'lines' }, { ...none, output: ['Mia', 'Ben'] }, { ...none, output: [' mia ', '', 'BEN'] })).toBeNull()
    expect(compareOutcome({ output: 'lines' }, { ...none, output: ['Mia', 'Ben'] }, { ...none, output: ['Ben', 'Mia'] })).toMatchObject({ code: 'output' })

    const result = { columns: ['name', 'n'], rows: [['a', 1], ['b', 2.5]] }
    const check = (mode: 'ordered' | 'unordered', actual: { columns: string[], rows: unknown[][] } | null) => compareOutcome({ result: mode }, { ...none, result }, { ...none, result: actual })
    expect(check('ordered', { columns: ['NAME', 'anzahl'], rows: [['a', 1.0], ['b', 2.5000000001]] })).toBeNull()
    // gleichnamige Spalten in anderer Reihenfolge
    expect(check('ordered', { columns: ['n', 'name'], rows: [[1, 'a'], [2.5, 'b']] })).toBeNull()
    expect(check('ordered', { columns: ['name', 'n'], rows: [['b', 2.5], ['a', 1]] })).toEqual({ code: 'result_order' })
    expect(check('unordered', { columns: ['name', 'n'], rows: [['b', 2.5], ['a', 1]] })).toBeNull()
    expect(check('unordered', { columns: ['name'], rows: [['a'], ['b']] })).toEqual({ code: 'result_columns', expected: 2, actual: 1 })
    expect(check('unordered', { columns: ['name', 'n'], rows: [['a', 1]] })).toEqual({ code: 'result_rows', expected: 2, actual: 1 })
    expect(check('unordered', { columns: ['name', 'n'], rows: [['a', 1], ['b', 3]] })).toEqual({ code: 'result_values', row: 2 })
    expect(check('unordered', null)).toEqual({ code: 'no_result' })

    const tables = { log: { columns: ['x', 'y'], rows: [[1, 2]] } }
    expect(compareOutcome({ tables: ['log'] }, { ...none, tables }, { ...none, tables: { log: { columns: ['y', 'x'], rows: [[2, 1]] } } })).toBeNull()
    expect(compareOutcome({ tables: ['log'] }, { ...none, tables }, { ...none, tables: {} })).toEqual({ code: 'table_missing', table: 'log' })
    expect(compareOutcome({ tables: ['log'] }, { ...none, tables }, { ...none, tables: { log: { columns: ['x', 'y'], rows: [] } } })).toEqual({ code: 'table_rows', table: 'log', expected: 1, actual: 0 })

    const schema = [{
      name: 'ausleihe',
      columns: [{ name: 'nr', type: 'INTEGER', primaryKey: true, notNull: false }, { name: 'buch_id', type: 'INT', primaryKey: false, notNull: true }],
      foreignKeys: [{ columns: ['buch_id'], table: 'buch', refColumns: ['id'] }],
    }]
    const variant = (changes: object) => [{ ...schema[0]!, ...changes }]
    const compare = (actual: typeof schema) => compareOutcome({ schema: ['ausleihe'] }, { ...none, schema }, { ...none, schema: actual })
    expect(compare(variant({ name: 'Ausleihe', columns: [{ name: 'Buch_ID', type: 'integer', primaryKey: false, notNull: true }, { name: 'nr', type: 'INT', primaryKey: true, notNull: false }], foreignKeys: [{ columns: ['buch_id'], table: 'BUCH', refColumns: [] }] }))).toBeNull()
    expect(compare([])).toEqual({ code: 'table_missing', table: 'ausleihe' })
    expect(compare(variant({ columns: [schema[0]!.columns[0]] }))).toEqual({ code: 'schema_column', table: 'ausleihe', column: 'buch_id' })
    expect(compare(variant({ columns: [...schema[0]!.columns, { name: 'x', type: '', primaryKey: false, notNull: false }] }))).toEqual({ code: 'schema_extra', table: 'ausleihe', column: 'x' })
    expect(compare(variant({ columns: [schema[0]!.columns[0], { ...schema[0]!.columns[1], type: 'TEXT' }] }))).toEqual({ code: 'schema_type', table: 'ausleihe', column: 'buch_id', expected: 'INT' })
    expect(compare(variant({ columns: [schema[0]!.columns[0], { ...schema[0]!.columns[1], notNull: false }] }))).toEqual({ code: 'schema_not_null', table: 'ausleihe', column: 'buch_id' })
    expect(compare(variant({ columns: [{ ...schema[0]!.columns[0], primaryKey: false }, schema[0]!.columns[1]] }))).toEqual({ code: 'schema_key', table: 'ausleihe', columns: 'nr' })
    expect(compare(variant({ foreignKeys: [] }))).toEqual({ code: 'schema_foreign', table: 'ausleihe', columns: 'buch_id', target: 'buch' })
  })

  it('findet verlangte Sprachbausteine auch verschachtelt', () => {
    const source = 'anweisung a\n  wiederhole 2 mal\n    wenn istWand dann\n      var x = 1\n    ende\n  ende\nende'
    expect(missingConstructs(source, ['procedure', 'repeatTimes', 'if', 'variable'])).toEqual([])
    expect(missingConstructs('schritt', ['repeatWhile'])).toEqual(['repeatWhile'])
    expect(missingConstructs('anweisung a\n  schritt\nende', ['function', 'recursion'])).toEqual(['function', 'recursion'])
    expect(missingConstructs('funktion a\n  wenn istWand dann\n    zurück 0\n  ende\n  schritt\n  zurück a() + 1\nende', ['function', 'recursion'])).toEqual([])
  })

  it('findet Bausteine in Programmiersprachen und SQL', () => {
    const java = javaOutline(`import klonk.Klonk;
public class Programm {
  static int f(int n) { if (n == 0) return 0; return f(n - 1) + 1; }
  public static void main(String[] args) { Klonk k = new Klonk(); while (!k.isWall()) k.step(); }
}`)
    expect(missingCodeConstructs(java, ['loop', 'if', 'method', 'returnValue', 'recursion', 'class', 'inheritance'])).toEqual(['class', 'inheritance'])
    const python = pythonOutline('class A:\n    def go(self):\n        self.go()\nclass B(A):\n    pass\nB().go()')
    expect(missingCodeConstructs(python, ['class', 'inheritance', 'recursion', 'method', 'loop', 'returnValue'])).toEqual(['loop', 'returnValue'])
    const js = javascriptOutline('import { Klonk } from \'klonk\'\nconst k = new Klonk()\nfor (let i = 0; i < 3; i++) k.step()')
    expect(missingCodeConstructs(js, ['loop', 'method', 'if'])).toEqual(['method', 'if'])
    expect(missingSqlConstructs('SELECT klasse, count(*) FROM s -- group by\nWHERE x IN (SELECT 1)', ['groupBy', 'subquery'])).toEqual(['groupBy'])
    expect(missingSqlConstructs('SELECT \'group by\' FROM t GROUP  BY x', ['groupBy', 'subquery'])).toEqual(['subquery'])
  })
})

describe('Lernmodule', () => {
  it('haben eindeutige IDs', () => {
    expect(new Set(LEARN_MODULES.map(m => m.id)).size).toBe(LEARN_MODULES.length)
    for (const module of LEARN_MODULES) expect(new Set(module.tasks.map(t => t.id)).size).toBe(module.tasks.length)
  })

  // Reihe E (Klonk-Script); die übrigen Reihen prüfen die Laufzeit-Tests in allen Sprachen (packages/runtime/tests/learn.test.ts)
  for (const module of trackModules('basics')) {
    for (const task of module.tasks) {
      it(`${module.id}/${task.id}`, async () => {
        for (const world of task.worlds) new World(world)
        const expected = await expectedOutcomes(task)

        // Musterlösungen (de, en und die übersetzte deutsche) lösen jede Welt und nutzen die verlangten Bausteine
        for (const solution of [task.solution!.de, task.solution!.en, translate(task.solution!.de, 'en')]) {
          expect(missingConstructs(solution, task.requires)).toEqual([])
          for (const [i, world] of task.worlds.entries()) {
            expect(compareOutcome(task.check, expected[i]!, await runTrusted(solution, world)), `${solution}\n(Welt ${i + 1})`).toBeNull()
          }
        }

        // Nichts zu tun ist nie schon die Lösung
        const empty = await Promise.all(task.worlds.map(world => runTrusted('', world)))
        expect(task.worlds.some((_, i) => compareOutcome(task.check, expected[i]!, empty[i]!) !== null)).toBe(true)
      })
    }
  }
})

describe('Modulprojekt', () => {
  // Wie isValidCloudPath (core): keine Pfadtricks und Sonderzeichen, nichts beginnt mit einem Punkt
  const validPath = (path: string) => path.split('/').every(part => !!part && part.length <= 120 && !/[\\:*?"<>|]/.test(part) && !part.startsWith('.'))

  it('legt je Aufgabe einen Ordner mit Text, Welten und Programm an', () => {
    for (const lang of ['de', 'en'] as const) {
      for (const module of LEARN_MODULES) {
        const language = module.track === 'basics' ? 'blocks' : module.track === 'sql' ? 'sql' : 'java'
        const extension = { blocks: 'blocks', sql: 'sql', java: 'java' }[language]
        module.tasks.forEach((task, i) => {
          const entry = taskFolderFiles(task, i, lang, language, module.track)
          for (const file of entry.files) expect(validPath(file.path), file.path).toBe(true)
          const worlds = entry.files.filter(f => f.path.endsWith('.klonkworld.json'))
          expect(worlds).toHaveLength(task.worlds.length)
          for (const world of worlds) new World(JSON.parse(world.content))
          expect(entry.files.filter(f => f.path.endsWith('.sqlite.sql'))).toHaveLength(task.databases?.length ?? 0)
          expect(entry.files.map(f => f.path)).toContain(`${entry.program}.${extension}`)
        })
      }
    }
    const first = taskFolderFiles(findModule('sequence')!.tasks[0]!, 0, 'de', 'klonk')
    expect(first.files.map(f => f.path)).toEqual(['1 Zur Marke/Aufgabe.md', '1 Zur Marke/Welt.klonkworld.json', '1 Zur Marke/Programm.klonk'])
  })

  it('liest den Lernstand aus Manifest und Programmen (auch aus Projekten ohne Ordner)', () => {
    const module = findModule('sequence')!
    const manifest = emptyManifest(module.id)
    manifest.tasks['to-the-mark'] = '1 Zur Marke/Programm'
    manifest.solved['to-the-mark'] = '2026-11-03T10:00:00.000Z'
    const text = serializeManifest(manifest)
    expect(JSON.parse(text).language).toBe('klonk')
    expect(parseManifest(text, module.id)).toEqual(manifest)
    expect(parseManifest(text, 'repeat').solved).toEqual({})
    expect(progressFromFiles(module, [
      { path: 'klonk.json', content: text },
      { path: '1 Zur Marke/Programm.klonk', content: 'schritt(4)' },
      { path: 'around-the-corner.blocks', content: '{"blocks":{}}' },
      { path: 'wall.klonk', content: '  ' },
    ])).toEqual({ solved: ['to-the-mark'], started: ['to-the-mark', 'around-the-corner'] })
  })

  it('Startvorlagen der Programmiersprachen zählen nicht als begonnen', () => {
    const module = { ...findModule('sequence')!, id: 'x', track: 'advanced' as const }
    const manifest = emptyManifest('x')
    manifest.tasks['to-the-mark'] = '1 Zur Marke/Programm'
    manifest.tasks['around-the-corner'] = '2 Um die Ecke/Programm'
    expect(starterSource('java', 'advanced', 'de')).toContain('public class Programm')
    expect(starterSource('python', 'apps', 'en')).toContain('Database')
    expect(progressFromFiles(module, [
      { path: 'klonk.json', content: JSON.stringify({ learn: manifest }) },
      { path: '1 Zur Marke/Programm.java', content: starterSource('java', 'advanced', 'de') },
      { path: '2 Um die Ecke/Programm.py', content: `${starterSource('python', 'advanced', 'de')}klonk.step()\n` },
    ]).started).toEqual(['around-the-corner'])
  })
})

describe('Modulprojekt und Speicherorte', () => {
  it('legt Manifest und je Aufgabe einen Ordner an', () => {
    const module = findModule('sequence')!
    const { folders, files } = moduleProjectFiles(module, 'de', 'klonk')
    expect(folders).toHaveLength(module.tasks.length)
    const manifest = parseManifest(files.find(f => f.path === 'klonk.json')!.content, module.id)
    expect(Object.keys(manifest.tasks)).toEqual(module.tasks.map(t => t.id))
    for (const program of Object.values(manifest.tasks)) expect(files.some(f => f.path === `${program}.klonk`)).toBe(true)
  })

  it('Speicherorte in fester Reihenfolge, Unbekanntes fällt weg', () => {
    expect(learnStorages(['folder', 'x', 'cloud'])).toEqual(['cloud', 'folder'])
    expect(learnStorages(null)).toEqual([])
  })
})

describe('Kürzel und Einstieg', () => {
  it('zählt je Reihe: Einstieg E1–E3, Grundkurs ab E4', () => {
    expect(moduleCode('paths')).toBe('E1')
    expect(moduleCode('patterns')).toBe('E3')
    expect(moduleCode('sequence')).toBe('E4')
    expect(moduleCode('functions')).toBe('E10')
    expect(moduleCode('code-start')).toBe('F1')
    expect(moduleCode('sql-select')).toBe('S1')
    expect(moduleCode('app-query')).toBe('A1')
  })

  it('Einstiegswelten bestehen aus ganzen 3×3-Platten (druckbar)', () => {
    const printable = LEARN_MODULES.filter(m => m.printable)
    expect(printable.map(m => m.id)).toEqual(['paths', 'building', 'patterns'])
    for (const module of printable) {
      for (const task of module.tasks) {
        for (const world of task.worlds) {
          expect(world.size.width % 3, `${module.id}/${task.id}`).toBe(0)
          expect(world.size.depth % 3, `${module.id}/${task.id}`).toBe(0)
        }
      }
    }
  })
})
