import { Interpreter, parse, type Statement } from '@klonk/klonk-script'
import { World, type CellData, type WorldData } from '@klonk/world'
import type { CheckFailure, Construct, LearnTask, Outcome, TaskCheck } from './types'

/** Führt ein vertrauenswürdiges Programm (Musterlösung) ohne Animation aus */
export async function runTrusted(source: string, start: WorldData): Promise<Outcome> {
  const world = new World(start)
  const output: string[] = []
  await Interpreter.fromSource(source, world, { print: text => output.push(text), wait: async () => {}, random: () => 0.5 }).run()
  return { world: world.toJSON(), output }
}

/** Zielzustände einer Aufgabe: Ergebnis der Musterlösung in jeder Startwelt */
export function expectedOutcomes(task: LearnTask): Promise<Outcome[]> {
  return Promise.all(task.worlds.map(world => runTrusted(task.solution.de, world)))
}

const cellKey = (c: CellData) => `${c.x},${c.z}`
const cellValue = (c?: CellData) => JSON.stringify([c?.bricks ?? [], c?.mark ?? null, !!c?.block])
const numbers = (output: string[]) => output.join('\n').match(/-?\d+(?:[.,]\d+)?/g) ?? []

/** Vergleicht das Ergebnis eines Programms mit dem Zielzustand – `null` = gelöst */
export function compareOutcome(check: TaskCheck, start: WorldData, expected: Outcome, actual: Outcome): CheckFailure | null {
  const id = start.characters[0]!.id.toLowerCase()
  const want = expected.world.characters.find(c => c.id.toLowerCase() === id)!
  const got = actual.world.characters.find(c => c.id.toLowerCase() === id)
  if (!got) return { code: 'character_missing' }
  if (check.position && (got.x !== want.x || got.z !== want.z)) {
    return { code: 'position', x: got.x + 1, y: got.z + 1, expectedX: want.x + 1, expectedY: want.z + 1 }
  }
  if (check.direction && got.direction !== want.direction) return { code: 'direction', direction: got.direction, expected: want.direction }
  if (check.cells) {
    const wantCells = new Map(expected.world.cells.map(c => [cellKey(c), c]))
    const gotCells = new Map(actual.world.cells.map(c => [cellKey(c), c]))
    const keys = [...new Set([...wantCells.keys(), ...gotCells.keys()])].sort()
    for (const key of keys) {
      if (cellValue(wantCells.get(key)) !== cellValue(gotCells.get(key))) {
        const [x, z] = key.split(',').map(Number)
        return { code: 'cell', x: x! + 1, y: z! + 1 }
      }
    }
  }
  if (check.output === 'numbers') {
    const want = numbers(expected.output)
    const got = numbers(actual.output)
    if (want.join(' ') !== got.join(' ')) return { code: 'output', expected: want.join(', '), actual: got.join(', ') }
  }
  return null
}

const CONSTRUCT_NODES: Record<Construct, (s: Statement) => boolean> = {
  repeatTimes: s => s.type === 'RepeatTimes',
  repeatWhile: s => s.type === 'RepeatWhile',
  if: s => s.type === 'If',
  procedure: s => s.type === 'Definition',
  function: s => s.type === 'Definition' && s.kind === 'function',
  variable: s => s.type === 'VarDeclaration',
}

function* statements(list: Statement[]): Generator<Statement> {
  for (const s of list) {
    yield s
    if ('body' in s) yield* statements(s.body)
    if (s.type === 'If') {
      for (const branch of s.branches) yield* statements(branch.body)
      if (s.otherwise) yield* statements(s.otherwise)
    }
  }
}

/** Verlangte Sprachbausteine, die im Programm fehlen (Syntaxfehler ⇒ wirft `KlonkError`) */
export function missingConstructs(source: string, requires: Construct[] = []): Construct[] {
  const all = [...statements(parse(source).body)]
  return requires.filter(construct => !all.some(CONSTRUCT_NODES[construct]))
}
