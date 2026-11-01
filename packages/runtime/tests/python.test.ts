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

const run = (source: string, extra: Partial<Extract<ToWorker, { type: 'run' }>> = {}) =>
  runPython({
    type: 'run', language: 'python', source, world, breakpoints: [], delay: 0, allowImports: false, files: {}, shared: createSharedState(), ...extra,
  }, m => messages.push(m), () => loadPyodide())

beforeEach(() => {
  messages.length = 0
})

describe('Python', { timeout: 60_000 }, () => {
  it('Roboter-API auf Deutsch, Englisch und in snake_case, print', async () => {
    await run('schritt()\nturn_left()\nrechtsDrehen()\nstep(2)\nhinlegen(blau)\nprint(position_x(), positionY())\nausgabe("fertig")\n')
    expect(messages.filter(m => m.type === 'command').map(m => (m as { command: { name: string } }).command.name))
      .toEqual(['step', 'turnLeft', 'turnRight', 'step', 'step', 'placeBrick'])
    expect(messages.filter(m => m.type === 'output')).toEqual([{ type: 'output', text: '4 1' }, { type: 'output', text: 'fertig' }])
    expect(messages.at(-1)).toEqual({ type: 'done' })
  })

  it('Schleifen, Funktionen und Bedingungen mit Sensoren', async () => {
    await run('def bis_zur_wand():\n    n = 0\n    while not ist_wand():\n        schritt()\n        n += 1\n    return n\n\nprint(bis_zur_wand())\n')
    expect(messages.filter(m => m.type === 'output')).toEqual([{ type: 'output', text: '4' }])
  })

  it('Weltfehler werden wie in den anderen Sprachen gemeldet (mit Zeile)', async () => {
    await run('linksDrehen()\nschritt()\n')
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'world', params: { worldCode: 'wall' }, range: { line: 2 } } })
  })

  it('Laufzeit- und Syntaxfehler mit Zeile', async () => {
    await run('x = 1\nprint(y)\n')
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'py_runtime', params: { name: 'NameError' }, range: { line: 2 } } })
    messages.length = 0
    await run('schritt()\nif True\n  schritt()\n')
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'py_runtime', params: { name: 'SyntaxError' }, range: { line: 2 } } })
  })

  it('falsche Farbe', async () => {
    await run('hinlegen("lila-blassblau")\n')
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'invalid_color', range: { line: 1 } } })
  })

  it('Projektdateien nur mit Bibliotheken importierbar', async () => {
    const files = { 'helfer.py': 'def zwei():\n    schritt()\n    schritt()\n' }
    await run('import helfer\nhelfer.zwei()\n', { files })
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'py_runtime', params: { name: 'ModuleNotFoundError' } } })
    messages.length = 0
    await run('import helfer\nhelfer.zwei()\nprint(position_x())\n', { files, allowImports: true })
    expect(messages.filter(m => m.type === 'output')).toEqual([{ type: 'output', text: '3' }])
  })
})
