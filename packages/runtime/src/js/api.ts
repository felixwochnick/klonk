import { BUILTINS, show, type BuiltinName, type RobotCommand, type Value } from '@klonk/klonk-script'
import { BRICK_COLORS, MARK_COLORS, WorldError, type World } from '@klonk/world'

export type JsHost = {
  world: World
  character: string
  command: (command: RobotCommand) => void
  print: (text: string) => void
  sleep: (ms: number) => void
}

/** Fehler in Aufrufen der Roboter-API (z. B. falsche Farbe) – wird wie Klonk-Script-Fehler übersetzt */
export class ApiError extends Error {
  constructor(public readonly code: string, public readonly params: Record<string, string | number> = {}) {
    super(code)
  }
}

/** Farbe in kanonischer Form (`'Red'`, `'red'` ⇒ `'red'`) – nur englische Namen */
function color<T extends string>(value: unknown, allowed: readonly T[]): T {
  const canonical = typeof value === 'string' ? value.toLowerCase() : value
  if (typeof canonical !== 'string' || !allowed.includes(canonical as T)) throw new ApiError('invalid_color', { value: String(value) })
  return canonical as T
}

/** Darstellung beliebiger JS-Werte (Ausgabe, Variablenansicht) */
export function display(value: unknown, depth = 0): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return show(value as Value)
  if (typeof value === 'function') return `ƒ ${value.name || '(anonym)'}`
  if (depth > 2) return '…'
  if (Array.isArray(value)) return `[${value.slice(0, 20).map(v => display(v, depth + 1)).join(', ')}${value.length > 20 ? ', …' : ''}]`
  try {
    const entries = Object.entries(value as object).slice(0, 20)
    return `{ ${entries.map(([k, v]) => `${k}: ${display(v, depth + 1)}`).join(', ')} }`
  }
  catch {
    return String(value)
  }
}

/**
 * Roboter-API für JS/TS/Python – dieselben Befehle wie in Klonk-Script, aber nur mit den englischen Namen
 * (die Schlüsselwörter dieser Sprachen sind ohnehin englisch). Liefert Name ⇒ Funktion bzw. Konstante.
 */
export function createApi(host: JsHost): Record<string, unknown> {
  const delay = () => host.sleep(-1)
  const run = <T>(fn: () => T): T => {
    try {
      return fn()
    }
    catch (error) {
      if (error instanceof WorldError) throw new ApiError('world', { worldCode: error.code, ...error.params })
      throw error
    }
  }
  const w = () => host.world
  const id = () => host.character

  const impl: Record<BuiltinName, unknown> = {
    step: (count: number = 1) => {
      if (!Number.isInteger(count) || count < 0) throw new ApiError('expected_count', { value: String(count) })
      for (let i = 0; i < count; i++) {
        run(() => w().step(id()))
        host.command({ name: 'step', id: id() })
        delay()
      }
    },
    turnLeft: () => {
      run(() => w().turnLeft(id()))
      host.command({ name: 'turnLeft', id: id() })
      delay()
    },
    turnRight: () => {
      run(() => w().turnRight(id()))
      host.command({ name: 'turnRight', id: id() })
      delay()
    },
    placeBrick: (c: unknown = 'red') => {
      const brick = color(c, BRICK_COLORS)
      run(() => w().placeBrick(id(), brick))
      host.command({ name: 'placeBrick', id: id(), color: brick })
      delay()
    },
    pickBrick: () => {
      run(() => w().pickBrick(id()))
      host.command({ name: 'pickBrick', id: id() })
      delay()
    },
    setMark: (c: unknown = 'yellow') => {
      const mark = color(c, MARK_COLORS)
      run(() => w().setMark(id(), mark))
      host.command({ name: 'setMark', id: id(), color: mark })
      delay()
    },
    removeMark: () => {
      run(() => w().removeMark(id()))
      host.command({ name: 'removeMark', id: id() })
      delay()
    },
    selectCharacter: (name: string) => {
      run(() => w().getCharacter(String(name)))
      host.character = String(name)
    },
    isWall: () => run(() => w().isWall(id())),
    isBrick: (c?: unknown) => run(() => w().isBrick(id(), c === undefined ? undefined : color(c, BRICK_COLORS))),
    isMark: (c?: unknown) => run(() => w().isMark(id(), c === undefined ? undefined : color(c, MARK_COLORS))),
    isFacingNorth: () => w().getCharacter(id()).direction === 'north',
    isFacingEast: () => w().getCharacter(id()).direction === 'east',
    isFacingSouth: () => w().getCharacter(id()).direction === 'south',
    isFacingWest: () => w().getCharacter(id()).direction === 'west',
    brickCount: () => w().bricksInFront(id()),
    positionX: () => w().getCharacter(id()).x + 1,
    positionY: () => w().getCharacter(id()).z + 1,
    print: (...values: unknown[]) => host.print(values.map(v => display(v)).join(' ')),
    wait: (seconds = 1) => host.sleep(Math.max(0, Math.min(Number(seconds) || 0, 60)) * 1000),
    random: (min: number, max: number) => Math.ceil(min) + Math.floor(Math.random() * (Math.floor(max) - Math.ceil(min) + 1)),
    red: 'red',
    blue: 'blue',
    yellow: 'yellow',
    green: 'green',
    orange: 'orange',
    purple: 'purple',
    white: 'white',
    black: 'black',
  }

  // Englische Schreibweisen; Konstanten als Werte
  const api: Record<string, unknown> = {}
  for (const [name, builtin] of Object.entries(BUILTINS) as [BuiltinName, (typeof BUILTINS)[BuiltinName]][]) {
    for (const spelling of builtin.names.en) api[spelling] = impl[name]
  }
  return api
}
