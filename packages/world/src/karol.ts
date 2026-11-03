import { WorldError } from './errors'
import type { CellData, Direction, WorldData } from './types'

/**
 * Robot-Karol-Welten (`.kdw`, Robot Karol 1.x–3.0) in Klonk-Welten umwandeln.
 * Aufbau: `KarolVersion… Breite Länge Höhe X Y Richtung`, danach je Feld ein Stapel aus `Höhe` Einträgen
 * (`n` leer, `z` Ziegel, `q` Quader) und `m`/`o` (Marke ja/nein); Robot Karol 3.0 hängt weitere Angaben an.
 */

export type KarolWorldWarning = { code: 'brick_on_cube' | 'unknown_entry', count: number, entry?: string }

/** Zuordnung Karol ⇒ Klonk (intern einstellbar, damit sie sich an Beispielwelten prüfen lässt) */
export type KarolWorldMapping = {
  /** Felder zeilenweise (`yx`: erst alle x zu y = 0 …) oder spaltenweise (`xy`) */
  order: 'xy' | 'yx'
  /** Karol-y wächst nach Norden (Klonk-z wächst nach Süden ⇒ spiegeln) */
  flipY: boolean
  /** Karol-Richtung 0–3 ⇒ Klonk-Richtung */
  directions: [Direction, Direction, Direction, Direction]
}

export const KAROL_WORLD_MAPPING: KarolWorldMapping = { order: 'xy', flipY: false, directions: ['south', 'west', 'north', 'east'] }

export function convertKarolWorld(text: string, mapping: KarolWorldMapping = KAROL_WORLD_MAPPING): { world: WorldData, warnings: KarolWorldWarning[] } {
  const tokens = text.trim().split(/\s+/)
  if (!/^KarolVersion/i.test(tokens[0] ?? '')) throw new WorldError('invalid_world', { reason: 'karol_header' })
  const [width, depth, height, x, y, direction] = tokens.slice(1, 7).map(Number) as number[]
  if (![width, depth, height, x, y, direction].every(n => Number.isInteger(n) && n! >= 0) || !width || !depth || !height)
    throw new WorldError('invalid_world', { reason: 'karol_size' })
  if (width > 64 || depth > 64) throw new WorldError('invalid_world', { reason: 'karol_too_large' })
  const body = tokens.slice(7)
  if (body.length < width * depth * (height + 1)) throw new WorldError('invalid_world', { reason: 'karol_truncated' })

  const toZ = (karolY: number) => (mapping.flipY ? depth - 1 - karolY : karolY)
  const warnings = new Map<string, KarolWorldWarning>()
  const warn = (code: KarolWorldWarning['code'], entry?: string) => {
    const key = `${code}:${entry ?? ''}`
    const existing = warnings.get(key)
    if (existing) existing.count++
    else warnings.set(key, { code, count: 1, ...(entry ? { entry } : {}) })
  }

  const cells: CellData[] = []
  for (let i = 0; i < width * depth; i++) {
    const kx = mapping.order === 'xy' ? Math.floor(i / depth) : i % width
    const ky = mapping.order === 'xy' ? i % depth : Math.floor(i / width)
    const entries = body.slice(i * (height + 1), (i + 1) * (height + 1))
    const stack = entries.slice(0, height)
    const cell: CellData = { x: kx, z: toZ(ky) }
    if (stack.includes('q')) {
      // Quader füllt in Klonk das ganze Feld
      cell.block = true
      if (stack.includes('z')) warn('brick_on_cube')
    }
    else {
      const bricks = stack.filter(e => e !== 'n')
      for (const entry of bricks) if (entry !== 'z') warn('unknown_entry', entry)
      if (bricks.length) cell.bricks = bricks.map(() => 'red' as const)
    }
    if (entries[height] === 'm' && !cell.block) cell.mark = 'yellow'
    if (cell.block || cell.bricks || cell.mark) cells.push(cell)
  }

  const world: WorldData = {
    version: 1,
    size: { width, depth, height: Math.min(Math.max(height, 1), 32) },
    maxJump: 1,
    cells,
    characters: [{ id: 'Karol', model: 'male', x: Math.min(x!, width - 1), z: toZ(Math.min(y!, depth - 1)), direction: mapping.directions[direction! % 4]! }],
  }
  return { world, warnings: [...warnings.values()] }
}
