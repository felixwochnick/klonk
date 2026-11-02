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

describe('Worker: JavaScript/TypeScript', () => {
  // Die Steuerung läuft über SharedArrayBuffer; Atomics.wait blockiert den Testthread nicht,
  // solange keine Pause angefordert wird (Delay 0, keine Haltepunkte).
  const shared = () => {
    const buffer = new SharedArrayBuffer(64 + 20_000)
    return buffer
  }

  it('führt JS mit der englischen Objekt-API aus, globale Befehle und deutsche Namen gibt es nicht', async () => {
    run('const k = new Klonk()\nwhile (!k.isWall()) { k.step() }\nk.turnRight()\nk.placeBrick("Red")\nprint("x =", k.positionX(), k.name, typeof step, typeof schritt, k)', { language: 'javascript', shared: shared() })
    await until(() => last()?.type === 'done')
    expect(messages.filter(m => m.type === 'command')).toHaveLength(6)
    expect(messages).toContainEqual({ type: 'command', command: { name: 'placeBrick', id: 'k', color: 'red' } })
    expect(messages).toContainEqual({ type: 'output', text: 'x = 5 k undefined undefined Klonk("k")' })
  })

  it('mehrere Figuren gleichzeitig steuern (Name, Nummer, alle)', async () => {
    const two: WorldData = { ...world, characters: [...world.characters, { id: 'Klara', model: 'female', x: 0, z: 2, direction: 'east' }] }
    run('const karl = new Klonk(1)\nconst klara = new Klonk("klara")\nkarl.step()\nklara.step(2)\nprint(Klonk.all().map(r => r.name + "@" + r.positionX()).join(" "))', { language: 'javascript', shared: shared(), world: two })
    await until(() => last()?.type === 'done')
    expect(messages.filter(m => m.type === 'command').map(m => m.type === 'command' && m.command.id)).toEqual(['k', 'Klara', 'Klara'])
    expect(messages).toContainEqual({ type: 'output', text: 'k@2 Klara@3' })

    messages.length = 0
    run('new Klonk("Nobody")', { language: 'javascript', shared: shared(), world: two })
    await until(() => last()?.type === 'error')
    expect(last()).toMatchObject({ error: { code: 'world', params: { worldCode: 'unknown_character', id: 'Nobody' }, range: { line: 1 } } })
  })

  it('TypeScript mit Typen läuft', async () => {
    run('function n(x: number): number {\n  return x + 1\n}\nconst y: number = n(2)\nprint(y)', { language: 'typescript', shared: shared() })
    await until(() => last()?.type === 'done')
    expect(messages).toContainEqual({ type: 'output', text: '3' })
  })

  it('Fehler mit Zeile: Welt, Laufzeit, Syntax, falsche Farbe', async () => {
    run('const k = new Klonk()\nk.turnLeft()\nk.step()', { language: 'javascript', shared: shared() })
    await until(() => last()?.type === 'error')
    expect(last()).toMatchObject({ error: { code: 'world', params: { worldCode: 'wall' }, range: { line: 3 } } })

    messages.length = 0
    run('let a = 1\nundefinedFunction()', { language: 'javascript', shared: shared() })
    await until(() => last()?.type === 'error')
    expect(last()).toMatchObject({ error: { code: 'js_runtime', params: { name: 'ReferenceError' }, range: { line: 2 } } })

    messages.length = 0
    run('let x = (', { language: 'javascript', shared: shared() })
    await until(() => last()?.type === 'error')
    expect(last()).toMatchObject({ error: { code: 'js_syntax', range: { line: 1 } } })

    messages.length = 0
    run('new Klonk().placeBrick("rot")', { language: 'javascript', shared: shared() })
    await until(() => last()?.type === 'error')
    expect(last()).toMatchObject({ error: { code: 'invalid_color' } })
  })

  it('Nutzercode hat keinen Netzwerkzugriff', async () => {
    run('print(typeof fetch, typeof XMLHttpRequest, typeof WebSocket)', { language: 'javascript', shared: shared() })
    await until(() => last()?.type === 'done')
    expect(messages).toContainEqual({ type: 'output', text: 'undefined undefined undefined' })
  })

  it('ohne gemeinsamen Speicher gibt es eine verständliche Meldung', async () => {
    run('new Klonk().step()', { language: 'javascript' })
    await until(() => last()?.type === 'error')
    expect(last()).toMatchObject({ error: { code: 'isolation_required' } })
  })
})
