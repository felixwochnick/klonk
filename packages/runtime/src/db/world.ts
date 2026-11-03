import { spell } from '@klonk/klonk-script'
import { BRICK_COLORS, CHARACTER_MODELS, DIRECTIONS, MARK_COLORS, parseWorld, type CellData, type CharacterData, type Direction, type WorldData } from '@klonk/world'
import type { SqlEngine, SqlValue } from './types'

/**
 * Die 3D-Welt als Datenbank: Tabellen für Weltgröße, Figuren, Ziegel, Marken und Quader – Namen und Werte in der
 * Sprache der Oberfläche (deutsch: `ziegel.farbe = 'rot'`). Koordinaten 1-basiert wie `positionX()`, y = Tiefe.
 * Änderungen per SQL werden zurück in die Welt übertragen (CHECK-Bedingungen fangen ungültige Werte schon in der Datenbank ab).
 */
export type WorldSqlLanguage = 'de' | 'en'

const NAMES = {
  de: {
    world: 'welt', width: 'breite', depth: 'tiefe', height: 'hoehe',
    characters: 'figuren', name: 'name', direction: 'richtung', look: 'aussehen',
    bricks: 'ziegel', level: 'ebene', color: 'farbe',
    marks: 'marken', blocks: 'quader',
  },
  en: {
    world: 'world', width: 'width', depth: 'depth', height: 'height',
    characters: 'characters', name: 'name', direction: 'direction', look: 'look',
    bricks: 'bricks', level: 'level', color: 'color',
    marks: 'marks', blocks: 'blocks',
  },
} as const

const DIRECTION_NAMES: Record<WorldSqlLanguage, Record<Direction, string>> = {
  de: { north: 'norden', east: 'osten', south: 'süden', west: 'westen' },
  en: { north: 'north', east: 'east', south: 'south', west: 'west' },
}
const LOOK_NAMES: Record<WorldSqlLanguage, Record<string, string>> = {
  de: { male: 'männlich', female: 'weiblich', diverse: 'divers', design: 'design' },
  en: { male: 'male', female: 'female', diverse: 'diverse', design: 'design' },
}
const colorName = (color: string, lang: WorldSqlLanguage) => (lang === 'de' ? spell(color as never, 'de') : color)

/** Fehler beim Übertragen der Tabellen in die Welt (Code ⇒ Übersetzung in der App) */
export class WorldTableError extends Error {
  constructor(public readonly code: string, public readonly params: Record<string, string | number> = {}) {
    super(code)
  }
}

export function worldTableNames(lang: WorldSqlLanguage) {
  const n = NAMES[lang]
  return [n.world, n.characters, n.bricks, n.marks, n.blocks]
}

const list = (values: readonly string[]) => values.map(v => `'${v.replace(/'/g, '\'\'')}'`).join(', ')
const literal = (value: string | number) => (typeof value === 'number' ? String(value) : `'${value.replace(/'/g, '\'\'')}'`)

/** SQL, das die Tabellen anlegt und mit der Welt füllt (gleich für SQLite und PostgreSQL) */
export function worldToSql(data: WorldData, lang: WorldSqlLanguage) {
  const n = NAMES[lang]
  const directions = DIRECTIONS.map(d => DIRECTION_NAMES[lang][d])
  const bricks = BRICK_COLORS.map(c => colorName(c, lang))
  const marks = MARK_COLORS.map(c => colorName(c, lang))
  const looks = [...CHARACTER_MODELS, 'design'].map(l => LOOK_NAMES[lang][l]!)
  const lines = [
    `CREATE TABLE ${n.world} (${n.width} INTEGER NOT NULL CHECK (${n.width} BETWEEN 1 AND 64), ${n.depth} INTEGER NOT NULL CHECK (${n.depth} BETWEEN 1 AND 64), ${n.height} INTEGER NOT NULL CHECK (${n.height} BETWEEN 1 AND 32));`,
    `CREATE TABLE ${n.characters} (${n.name} TEXT PRIMARY KEY, x INTEGER NOT NULL, y INTEGER NOT NULL, ${n.direction} TEXT NOT NULL CHECK (${n.direction} IN (${list(directions)})), ${n.look} TEXT NOT NULL CHECK (${n.look} IN (${list(looks)})));`,
    `CREATE TABLE ${n.bricks} (x INTEGER NOT NULL, y INTEGER NOT NULL, ${n.level} INTEGER NOT NULL CHECK (${n.level} >= 1), ${n.color} TEXT NOT NULL CHECK (${n.color} IN (${list(bricks)})), PRIMARY KEY (x, y, ${n.level}));`,
    `CREATE TABLE ${n.marks} (x INTEGER NOT NULL, y INTEGER NOT NULL, ${n.color} TEXT NOT NULL CHECK (${n.color} IN (${list(marks)})), PRIMARY KEY (x, y));`,
    `CREATE TABLE ${n.blocks} (x INTEGER NOT NULL, y INTEGER NOT NULL, PRIMARY KEY (x, y));`,
    `INSERT INTO ${n.world} VALUES (${data.size.width}, ${data.size.depth}, ${data.size.height});`,
  ]
  const insert = (table: string, rows: (string | number)[][]) => {
    if (rows.length) lines.push(`INSERT INTO ${table} VALUES ${rows.map(r => `(${r.map(literal).join(', ')})`).join(', ')};`)
  }
  insert(n.characters, data.characters.map(c => [c.id, c.x + 1, c.z + 1, DIRECTION_NAMES[lang][c.direction], LOOK_NAMES[lang][c.design ? 'design' : c.model]!]))
  insert(n.bricks, data.cells.flatMap(cell => (cell.bricks ?? []).map((color, i) => [cell.x + 1, cell.z + 1, i + 1, colorName(color, lang)])))
  insert(n.marks, data.cells.filter(c => c.mark).map(c => [c.x + 1, c.z + 1, colorName(c.mark!, lang)]))
  insert(n.blocks, data.cells.filter(c => c.block).map(c => [c.x + 1, c.z + 1]))
  return lines.join('\n')
}

const reverse = <T extends string>(map: Record<T, string>) => Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k])) as Record<string, T>

/** Tabellen lesen und daraus die Welt bauen (Figuren behalten ihr eingebettetes Design, solange `aussehen = 'design'`) */
export async function sqlToWorld(engine: SqlEngine, previous: WorldData, lang: WorldSqlLanguage): Promise<WorldData> {
  const n = NAMES[lang]
  const rows = async (sql: string) => {
    try {
      return (await engine.query(sql)).rows
    }
    catch {
      throw new WorldTableError('world_table_missing', { table: /FROM (\w+)/.exec(sql)?.[1] ?? '' })
    }
  }
  const [size] = await rows(`SELECT ${n.width}, ${n.depth}, ${n.height} FROM ${n.world}`)
  if (!size) throw new WorldTableError('world_size_missing', { table: n.world })
  const [width, depth, height] = size.map(Number) as [number, number, number]

  const position = (table: string, x: SqlValue, y: SqlValue) => {
    const px = Number(x)
    const py = Number(y)
    if (!Number.isInteger(px) || !Number.isInteger(py) || px < 1 || py < 1 || px > width || py > depth) {
      throw new WorldTableError('world_outside', { table, x: String(x), y: String(y), width, depth })
    }
    return { x: px - 1, z: py - 1 }
  }
  const directions = reverse(DIRECTION_NAMES[lang])
  const looks = reverse(LOOK_NAMES[lang] as Record<string, string>)
  const brickColors = Object.fromEntries(BRICK_COLORS.map(c => [colorName(c, lang), c]))
  const markColors = Object.fromEntries(MARK_COLORS.map(c => [colorName(c, lang), c]))

  const cells = new Map<string, CellData>()
  const cell = (at: { x: number, z: number }) => {
    const key = `${at.x},${at.z}`
    let found = cells.get(key)
    if (!found) cells.set(key, found = { ...at })
    return found
  }
  for (const [x, y, , color] of await rows(`SELECT x, y, ${n.level}, ${n.color} FROM ${n.bricks} ORDER BY x, y, ${n.level}`)) {
    const target = cell(position(n.bricks, x!, y!))
    const brick = brickColors[String(color)]
    if (!brick) throw new WorldTableError('world_value', { table: n.bricks, column: n.color, value: String(color) })
    target.bricks = [...(target.bricks ?? []), brick]
    if (target.bricks.length > height) throw new WorldTableError('world_too_high', { x: String(x), y: String(y), height })
  }
  for (const [x, y, color] of await rows(`SELECT x, y, ${n.color} FROM ${n.marks}`)) {
    const mark = markColors[String(color)]
    if (!mark) throw new WorldTableError('world_value', { table: n.marks, column: n.color, value: String(color) })
    cell(position(n.marks, x!, y!)).mark = mark
  }
  for (const [x, y] of await rows(`SELECT x, y FROM ${n.blocks}`)) cell(position(n.blocks, x!, y!)).block = true

  const characters: CharacterData[] = []
  for (const [name, x, y, direction, look] of await rows(`SELECT ${n.name}, x, y, ${n.direction}, ${n.look} FROM ${n.characters}`)) {
    const id = String(name ?? '')
    const before = previous.characters.find(c => c.id.toLowerCase() === id.toLowerCase())
    const model = looks[String(look)]
    const dir = directions[String(direction)]
    if (!dir) throw new WorldTableError('world_value', { table: n.characters, column: n.direction, value: String(direction) })
    if (!model) throw new WorldTableError('world_value', { table: n.characters, column: n.look, value: String(look) })
    if (model === 'design' && !before?.design) throw new WorldTableError('world_design', { name: id })
    characters.push({
      id,
      ...position(n.characters, x!, y!),
      direction: dir,
      model: model === 'design' ? before!.model : model as CharacterData['model'],
      ...(model === 'design' ? { design: before!.design } : {}),
    })
  }

  try {
    return parseWorld({ version: 1, size: { width, depth, height }, maxJump: previous.maxJump, cells: [...cells.values()], characters })
  }
  catch (error) {
    throw new WorldTableError('world_invalid', { reason: String((error as { params?: { reason?: string } }).params?.reason ?? (error as Error).message) })
  }
}
