import { translate } from '@klonk/klonk-script'
import { World } from '@klonk/world'
import { describe, expect, it } from 'vitest'
import { compareOutcome, emptyManifest, expectedOutcomes, findModule, LEARN_MODULES, moduleLabel, learnStorages, map, missingConstructs, moduleProjectFiles, parseManifest, progressFromFiles, runTrusted, serializeManifest, taskFolderFiles } from '../src'

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

  it('verlangt genau eine Figur', () => {
    expect(() => map('. .')).toThrow()
  })
})

describe('Prüfung', () => {
  const start = map('> . . y')
  const check = { position: true, cells: true, output: 'numbers' as const }

  it('meldet Position, Felder und Ausgabe', async () => {
    const expected = await runTrusted('schritt(3)\nmarkieren(rot)\nausgabe(3)', start)
    expect(compareOutcome(check, start, expected, await runTrusted('schritt(2)', start)))
      .toEqual({ code: 'position', x: 3, y: 1, expectedX: 4, expectedY: 1 })
    expect(compareOutcome(check, start, expected, await runTrusted('schritt(3)', start)))
      .toEqual({ code: 'cell', x: 4, y: 1 })
    expect(compareOutcome(check, start, expected, await runTrusted('schritt(3)\nmarkieren(rot)\nausgabe("Es sind 4")', start)))
      .toEqual({ code: 'output', expected: '3', actual: '4' })
    expect(compareOutcome(check, start, expected, await runTrusted('schritt(3)\nmarkieren(rot)\nausgabe("Ergebnis: 3")', start))).toBeNull()
  })

  it('findet verlangte Sprachbausteine auch verschachtelt', () => {
    const source = 'anweisung a\n  wiederhole 2 mal\n    wenn istWand dann\n      var x = 1\n    ende\n  ende\nende'
    expect(missingConstructs(source, ['procedure', 'repeatTimes', 'if', 'variable'])).toEqual([])
    expect(missingConstructs('schritt', ['repeatWhile'])).toEqual(['repeatWhile'])
  })
})

describe('Lernmodule', () => {
  it('haben eindeutige IDs', () => {
    expect(new Set(LEARN_MODULES.map(m => m.id)).size).toBe(LEARN_MODULES.length)
    for (const module of LEARN_MODULES) expect(new Set(module.tasks.map(t => t.id)).size).toBe(module.tasks.length)
  })

  for (const module of LEARN_MODULES) {
    for (const task of module.tasks) {
      it(`${module.id}/${task.id}`, async () => {
        for (const world of task.worlds) new World(world)
        const expected = await expectedOutcomes(task)

        // Musterlösungen (de, en und die übersetzte deutsche) lösen jede Welt und nutzen die verlangten Bausteine
        for (const solution of [task.solution.de, task.solution.en, translate(task.solution.de, 'en')]) {
          expect(missingConstructs(solution, task.requires)).toEqual([])
          for (const [i, world] of task.worlds.entries()) {
            expect(compareOutcome(task.check, world, expected[i]!, await runTrusted(solution, world)), `${solution}\n(Welt ${i + 1})`).toBeNull()
          }
        }

        // Nichts zu tun ist nie schon die Lösung
        const empty = await Promise.all(task.worlds.map(world => runTrusted('', world)))
        expect(task.worlds.some((world, i) => compareOutcome(task.check, world, expected[i]!, empty[i]!) !== null)).toBe(true)
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
        module.tasks.forEach((task, i) => {
          const entry = taskFolderFiles(task, i, lang, 'blocks')
          for (const file of entry.files) expect(validPath(file.path), file.path).toBe(true)
          const worlds = entry.files.filter(f => f.path.endsWith('.klonkworld.json'))
          expect(worlds).toHaveLength(task.worlds.length)
          for (const world of worlds) new World(JSON.parse(world.content))
          expect(entry.files.map(f => f.path)).toContain(`${entry.program}.blocks`)
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

describe('Nummerierung', () => {
  it('zählt Einstieg und Grundkurs getrennt', () => {
    expect(moduleLabel('paths')).toBe('E1')
    expect(moduleLabel('patterns')).toBe('E3')
    expect(moduleLabel('sequence')).toBe('1')
    expect(moduleLabel('functions')).toBe('7')
  })

  it('Einstiegswelten bestehen aus ganzen 3×3-Platten (druckbar)', () => {
    for (const module of LEARN_MODULES.filter(m => m.track === 'start')) {
      for (const task of module.tasks) {
        for (const world of task.worlds) {
          expect(world.size.width % 3, `${module.id}/${task.id}`).toBe(0)
          expect(world.size.depth % 3, `${module.id}/${task.id}`).toBe(0)
        }
      }
    }
  })
})
