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

describe('Worker: Figuren erstellen und wechseln', () => {
  it('erstelle(name, aussehen, x, y) steuert ab sofort die neue Figur, wechsle schaltet zurück', async () => {
    run('erstelle("Kim", "weiblich", 1, 3)\nschritt\nwechsle("k")\nschritt\nausgabe(positionX)')
    await until(() => last()?.type === 'done')
    const commands = messages.filter(m => m.type === 'command').map(m => (m as { command: { name: string, id: string } }).command)
    expect(commands.map(c => `${c.name}:${c.id}`)).toEqual(['createCharacter:Kim', 'step:Kim', 'step:k'])
    expect(messages).toContainEqual(expect.objectContaining({ command: expect.objectContaining({ character: expect.objectContaining({ id: 'Kim', model: 'female', x: 0, z: 2 }) }) }))
    // angezeigte Welt spielt das nach
    const shown = new World(world)
    for (const c of commands) applyCommand(shown, (messages.find(m => m.type === 'command' && (m as { command: { name: string, id: string } }).command === c) as { command: Parameters<typeof applyCommand>[1] }).command)
    expect(shown.getCharacter('Kim').z).toBe(2)
  })

  it('Name doppelt, Lizenzgrenze, eigenes Design', async () => {
    run('erstelle("K")')
    await until(() => last()?.type === 'error')
    expect(last()).toMatchObject({ error: { code: 'world', params: { worldCode: 'duplicate_name' } } })
    messages.length = 0
    run('erstelle("Kim")', { maxCharacters: 1 })
    await until(() => last()?.type === 'error')
    expect(last()).toMatchObject({ error: { code: 'world', params: { worldCode: 'character_limit' } } })
    messages.length = 0
    const design = { version: 1 as const, base: 'diverse' as const, colors: { skin: '#ffffff', shirt: '#000000', pants: '#000000', hair: '#000000', eyes: '#000000' } }
    run('erstelle("Robo", "ritter")', { designs: { Ritter: design } })
    await until(() => last()?.type === 'done')
    expect(messages[0]).toMatchObject({ command: { character: { id: 'Robo', model: 'diverse', design } } })
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
    run(`import { Klonk, print } from 'klonk'; const k = new Klonk()\nwhile (!k.isWall()) { k.step() }\nk.turnRight()\nk.placeBrick("Red")\nprint("x =", k.positionX(), k.name, typeof step, typeof schritt, k)`, { language: 'javascript', shared: shared() })
    await until(() => last()?.type === 'done')
    expect(messages.filter(m => m.type === 'command')).toHaveLength(6)
    expect(messages).toContainEqual({ type: 'command', command: { name: 'placeBrick', id: 'k', color: 'red' } })
    expect(messages).toContainEqual({ type: 'output', text: 'x = 5 k undefined undefined Klonk("k")' })
  })

  it('mehrere Figuren gleichzeitig steuern (Name, Nummer, alle)', async () => {
    const two: WorldData = { ...world, characters: [...world.characters, { id: 'Klara', model: 'female', x: 0, z: 2, direction: 'east' }] }
    run('import { Klonk, print } from "klonk"; const karl = new Klonk(1)\nconst klara = new Klonk("klara")\nkarl.step()\nklara.step(2)\nprint(Klonk.all().map(r => r.name + "@" + r.positionX()).join(" "))', { language: 'javascript', shared: shared(), world: two })
    await until(() => last()?.type === 'done')
    expect(messages.filter(m => m.type === 'command').map(m => m.type === 'command' && m.command.id)).toEqual(['k', 'Klara', 'Klara'])
    expect(messages).toContainEqual({ type: 'output', text: 'k@2 Klara@3' })

    messages.length = 0
    run('import { Klonk } from "klonk"; new Klonk("Nobody")', { language: 'javascript', shared: shared(), world: two })
    await until(() => last()?.type === 'error')
    expect(last()).toMatchObject({ error: { code: 'world', params: { worldCode: 'unknown_character', id: 'Nobody' }, range: { line: 1 } } })
  })

  it('TypeScript mit Typen läuft', async () => {
    run('import { print } from "klonk"; function n(x: number): number {\n  return x + 1\n}\nconst y: number = n(2)\nprint(y)', { language: 'typescript', shared: shared() })
    await until(() => last()?.type === 'done')
    expect(messages).toContainEqual({ type: 'output', text: '3' })
  })

  it('Fehler mit Zeile: Welt, Laufzeit, Syntax, falsche Farbe', async () => {
    run('import { Klonk } from "klonk"; const k = new Klonk()\nk.turnLeft()\nk.step()', { language: 'javascript', shared: shared() })
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
    run('import { Klonk } from "klonk"; new Klonk().placeBrick("rot")', { language: 'javascript', shared: shared() })
    await until(() => last()?.type === 'error')
    expect(last()).toMatchObject({ error: { code: 'invalid_color' } })
  })

  it('Nutzercode hat keinen Netzwerkzugriff', async () => {
    run('import { print } from "klonk"; print(typeof fetch, typeof XMLHttpRequest, typeof WebSocket)', { language: 'javascript', shared: shared() })
    await until(() => last()?.type === 'done')
    expect(messages).toContainEqual({ type: 'output', text: 'undefined undefined undefined' })
  })

  it('ohne gemeinsamen Speicher gibt es eine verständliche Meldung', async () => {
    run('new Klonk().step()', { language: 'javascript' })
    await until(() => last()?.type === 'error')
    expect(last()).toMatchObject({ error: { code: 'isolation_required' } })
  })

  it('Roboter-API nur per import; Projektdateien als Module (mit Lizenz)', async () => {
    run('new Klonk().step()', { language: 'javascript', shared: shared() })
    await until(() => last()?.type === 'error')
    expect(last()).toMatchObject({ error: { code: 'js_runtime', params: { name: 'ReferenceError' } } })

    messages.length = 0
    run('import * as klonk from "klonk"\nimport walk, { twice } from "./lib/walk"\nconst k = new klonk.Klonk()\nwalk(k)\nklonk.print(twice(k.positionX()))', {
      language: 'typescript', shared: shared(), path: 'src/main.ts', allowImports: true,
      files: { 'src/lib/walk.ts': 'import type { Klonk } from "klonk"\nexport * from "./math"\nexport default function walk(k: Klonk) {\n  k.step(2)\n}', 'src/lib/math.js': 'export const twice = (x) => 2 * x' },
    })
    await until(() => last()?.type === 'done')
    expect(messages).toContainEqual({ type: 'output', text: '6' })

    messages.length = 0
    run('import walk from "./lib/walk"', { language: 'javascript', shared: shared(), path: 'src/main.js', files: { 'src/lib/walk.js': '' } })
    await until(() => last()?.type === 'error')
    expect(last()).toMatchObject({ error: { code: 'feature_libraries' } })
  })

  it('Klonk.create', async () => {
    run('import { Klonk, print } from "klonk"; const kim = Klonk.create("Kim", "female", 3, 1)\nkim.step()\nprint(kim.name, kim.positionX(), kim.positionY(), Klonk.all().length)', { language: 'javascript', shared: shared() })
    await until(() => last()?.type === 'done')
    expect(messages).toContainEqual({ type: 'output', text: 'Kim 3 2 2' })
  })

  it('Designs laden, ändern, speichern und verwenden (Lizenz)', async () => {
    const design = { version: 1 as const, base: 'female' as const, colors: { skin: '#e8b48a', shirt: '#aa0000', pants: '#000000', hair: '#000000', eyes: '#000000' }, accessory: 'none' as const }
    run('import { Klonk, loadDesign, saveDesign } from "klonk"\nconst d = JSON.parse(loadDesign("Ritter"))\nd.colors.shirt = "#00ff00"\nsaveDesign("gruen", d)\nKlonk.create("G", "gruen")', { language: 'javascript', shared: shared(), designs: { ritter: design }, saveDesigns: true })
    await until(() => last()?.type === 'done')
    const saved = messages.find(m => m.type === 'saveDesign') as { name: string, design: { colors: { shirt: string } } } | undefined
    expect(saved).toMatchObject({ name: 'gruen', design: { colors: { shirt: '#00ff00' } } })
    expect(messages).toContainEqual(expect.objectContaining({ command: expect.objectContaining({ name: 'createCharacter', character: expect.objectContaining({ id: 'G', design: expect.objectContaining({ colors: expect.objectContaining({ shirt: '#00ff00' }) }) }) }) }))
    messages.length = 0
    run('import { loadDesign } from "klonk"\nloadDesign("ritter")', { language: 'javascript', shared: shared() })
    await until(() => last()?.type === 'error')
    expect(last()).toMatchObject({ error: { code: 'world', params: { worldCode: 'design_license' } } })
  })
})
