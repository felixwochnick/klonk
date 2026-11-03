import { translate } from '@klonk/klonk-script'
import { World } from '@klonk/world'
import { describe, expect, it } from 'vitest'
import { compareOutcome, expectedOutcomes, LEARN_MODULES, map, missingConstructs, runTrusted } from '../src'

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
