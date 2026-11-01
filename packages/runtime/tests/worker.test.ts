import { World, type WorldData } from '@klonk/world'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FromWorker, ToWorker } from '../src/protocol'
import { applyCommand } from '../src/runner'

// Worker-Umgebung nachbilden: postMessage sammelt Nachrichten, onmessage setzt das Modul
const messages: FromWorker[] = []
const fakeSelf = { postMessage: (m: FromWorker) => messages.push(m), onmessage: null as null | ((e: { data: ToWorker }) => void) }
vi.stubGlobal('self', fakeSelf)
await import('../src/worker')
const send = (data: ToWorker) => fakeSelf.onmessage!({ data })

const world: WorldData = {
  version: 1,
  size: { width: 5, depth: 5, height: 3 },
  cells: [],
  characters: [{ id: 'k', model: 'male', x: 0, z: 0, direction: 'east' }],
}

const run = (source: string, extra: Partial<Extract<ToWorker, { type: 'run' }>> = {}) =>
  send({ type: 'run', language: 'klonk', source, world, breakpoints: [], delay: 0, allowImports: false, files: {}, ...extra })

async function until(predicate: () => boolean) {
  for (let i = 0; i < 200 && !predicate(); i++) await new Promise(r => setTimeout(r, 5))
  expect(predicate()).toBe(true)
}

const last = () => messages.at(-1)

beforeEach(() => {
  messages.length = 0
})

describe('Worker', () => {
  it('führt aus, meldet Befehle, Ausgaben und Ende', async () => {
    run('schritt\nhinlegen(blau)\nausgabe("fertig")')
    await until(() => last()?.type === 'done')
    expect(messages).toEqual([
      { type: 'command', command: { name: 'step', id: 'k' } },
      { type: 'command', command: { name: 'placeBrick', id: 'k', color: 'blue' } },
      { type: 'output', text: 'fertig' },
      { type: 'done' },
    ])
  })

  it('meldet Fehler mit Position', async () => {
    run('linksDrehen\nschritt')
    await until(() => last()?.type === 'error')
    expect(last()).toMatchObject({ type: 'error', error: { code: 'world', params: { worldCode: 'wall' }, range: { line: 2 } } })
  })

  it('hält an Breakpoints, zeigt Variablen und läuft im Einzelschritt weiter', async () => {
    run('var x = 1\nx = x + 1\nschritt\nausgabe(x)', { breakpoints: [3] })
    await until(() => last()?.type === 'paused')
    expect(last()).toMatchObject({ type: 'paused', reason: 'breakpoint', range: { line: 3 }, variables: { x: 2 } })

    send({ type: 'step' })
    await until(() => last()?.type === 'paused' && (last() as { range: { line: number } }).range.line === 4)
    expect(messages.filter(m => m.type === 'command')).toHaveLength(1)

    send({ type: 'resume' })
    await until(() => last()?.type === 'done')
    expect(messages).toContainEqual({ type: 'output', text: '2' })
  })

  it('lässt sich pausieren und Endlosschleifen bleiben steuerbar', async () => {
    run('var i = 0\nwiederhole immer\n  i = i + 1\nende')
    await new Promise(r => setTimeout(r, 30))
    send({ type: 'pause' })
    await until(() => last()?.type === 'paused')
    const paused = last() as Extract<FromWorker, { type: 'paused' }>
    expect(paused.reason).toBe('pause')
    expect(Number(paused.variables.i)).toBeGreaterThan(0)
  })

  it('Befehle lassen sich auf der angezeigten Welt nachspielen', () => {
    const shown = new World(world)
    applyCommand(shown, { name: 'step', id: 'k' })
    applyCommand(shown, { name: 'placeBrick', id: 'k', color: 'green' })
    expect(shown.getCharacter('k').x).toBe(1)
    expect(shown.cell({ x: 2, z: 0 }).bricks).toEqual(['green'])
  })
})
