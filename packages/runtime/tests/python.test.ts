import type { WorldData } from '@klonk/world'
import { loadPyodide } from 'pyodide'
import { beforeEach, describe, expect, it } from 'vitest'
import type { FromWorker, ToWorker } from '../src/protocol'
import { runPython } from '../src/python/run'
import { createSharedState } from '../src/js/shared'

// Python (Pyodide) direkt in Node – im Browser lädt der Worker Pyodide von /pyodide/
const messages: FromWorker[] = []
const world: WorldData = {
  version: 1,
  size: { width: 5, depth: 5, height: 3 },
  cells: [],
  characters: [{ id: 'k', model: 'male', x: 0, z: 0, direction: 'east' }],
}

// Roboter-API in Zeile 1 importieren (Zeilennummern bleiben gleich)
const IMPORT = 'from klonk import *; '
const run = (source: string, extra: Partial<Extract<ToWorker, { type: 'run' }>> = {}, prefix = IMPORT) =>
  runPython({
    type: 'run', language: 'python', source: prefix + source, world, breakpoints: [], delay: 0, allowImports: false, files: {}, shared: createSharedState(), ...extra,
  }, m => messages.push(m), () => loadPyodide())

beforeEach(() => {
  messages.length = 0
})

describe('Python', { timeout: 60_000 }, () => {
  it('Klasse Klonk mit Methoden in snake_case, print, keine globalen Befehle', async () => {
    await run('k = Klonk()\nk.step()\nk.turn_left()\nk.turn_right()\nk.step(2)\nk.place_brick(blue)\nprint(k.position_x(), k.position_y(), k.name, k)\nprint("done", "Klonk" in dir(__builtins__), "red" in dir(__builtins__))\n')
    expect(messages.filter(m => m.type === 'command').map(m => (m as { command: { name: string } }).command.name))
      .toEqual(['step', 'turnLeft', 'turnRight', 'step', 'step', 'placeBrick'])
    expect(messages.filter(m => m.type === 'output')).toEqual([{ type: 'output', text: '4 1 k Klonk(\'k\')' }, { type: 'output', text: 'done False False' }])
    expect(messages.at(-1)).toEqual({ type: 'done' })
  })

  it('mehrere Figuren: Name, Nummer, alle', async () => {
    const two: WorldData = { ...world, characters: [...world.characters, { id: 'Klara', model: 'female', x: 0, z: 2, direction: 'east' }] }
    await run('klara = Klonk("Klara")\nklara.step(2)\nKlonk(1).step()\nprint([r.name + str(r.position_x()) for r in Klonk.all()])\n', { world: two })
    expect(messages.filter(m => m.type === 'command').map(m => (m as { command: { id: string } }).command.id)).toEqual(['Klara', 'Klara', 'k'])
    expect(messages.filter(m => m.type === 'output')).toEqual([{ type: 'output', text: '[\'k2\', \'Klara3\']' }])
    messages.length = 0
    await run('Klonk("Nobody")\n', { world: two })
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'world', params: { worldCode: 'unknown_character' }, range: { line: 1 } } })
  })

  it('Schleifen, Funktionen und Bedingungen mit Sensoren', async () => {
    await run('from klonk import Klonk\n\ndef to_wall(robot):\n    n = 0\n    while not robot.is_wall():\n        robot.step()\n        n += 1\n    return n\n\nprint(to_wall(Klonk()))\n', {}, '')
    expect(messages.filter(m => m.type === 'output')).toEqual([{ type: 'output', text: '4' }])
  })

  it('Weltfehler werden wie in den anderen Sprachen gemeldet (mit Zeile)', async () => {
    await run('k = Klonk()\nk.turn_left()\nk.step()\n')
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'world', params: { worldCode: 'wall' }, range: { line: 3 } } })
  })

  it('Laufzeit- und Syntaxfehler mit Zeile', async () => {
    await run('x = 1\nprint(y)\n')
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'py_runtime', params: { name: 'NameError' }, range: { line: 2 } } })
    messages.length = 0
    await run('x = 1\nif True\n  x = 2\n')
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'py_runtime', params: { name: 'SyntaxError' }, range: { line: 2 } } })
  })

  it('falsche Farbe', async () => {
    await run('Klonk().place_brick("rot")\n')
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'invalid_color', range: { line: 1 } } })
  })

  it('Projektdateien nur mit Bibliotheken importierbar', async () => {
    const files = { 'tools/helfer.py': 'def two(robot):\n    robot.step()\n    robot.step()\n' }
    await run('from tools import helfer\nhelfer.two(Klonk())\n', { files })
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'py_runtime', params: { name: 'ModuleNotFoundError' } } })
    messages.length = 0
    await run('from tools import helfer\nk = Klonk()\nhelfer.two(k)\nprint(k.position_x())\n', { files, allowImports: true })
    expect(messages.filter(m => m.type === 'output')).toEqual([{ type: 'output', text: '3' }])
  })

  it('ohne import gibt es keine Roboter-API', async () => {
    await run('k = Klonk()\n', {}, '')
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'py_runtime', params: { name: 'NameError' }, range: { line: 1 } } })
    messages.length = 0
    await run('import klonk\nklonk.Klonk().step()\nprint(klonk.red)\n', {}, '')
    expect(messages.filter(m => m.type === 'output')).toEqual([{ type: 'output', text: 'red' }])
  })
})
