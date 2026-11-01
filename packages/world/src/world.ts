import { WorldError } from './errors'
import type { BrickColor, CellData, CharacterData, CharacterModel, Direction, MarkColor, Position, WorldData } from './types'
import { DIRECTIONS } from './types'
import { parseWorld } from './schema'

type Cell = { bricks: BrickColor[], mark: MarkColor | null, block: boolean }

/** Änderungen für die 3D-Ansicht (und Aufzeichnung/Debugger) */
export type WorldEvent
  = | { type: 'move', id: string, from: Position & { y: number }, to: Position & { y: number } }
    | { type: 'turn', id: string, direction: Direction }
    | { type: 'brick-placed', at: Position, color: BrickColor, level: number }
    | { type: 'brick-removed', at: Position, level: number }
    | { type: 'mark-set', at: Position, color: MarkColor }
    | { type: 'mark-removed', at: Position }
    | { type: 'block-set', at: Position, block: boolean }
    | { type: 'character-added', character: CharacterData }
    | { type: 'character-removed', id: string }
    | { type: 'reset' }

const OFFSETS: Record<Direction, Position> = {
  north: { x: 0, z: -1 },
  east: { x: 1, z: 0 },
  south: { x: 0, z: 1 },
  west: { x: -1, z: 0 },
}

/**
 * Spielwelt im Robot-Karol-Prinzip: ein Raster mit Ziegelstapeln, Marken und festen Quadern,
 * in dem Figuren laufen, sich drehen, Ziegel legen/aufheben und Felder markieren.
 * Rein logisch (ohne Darstellung) – läuft im Browser, im Worker und in Tests.
 */
export class World {
  readonly width: number
  readonly depth: number
  readonly height: number
  readonly maxJump: number

  private cells = new Map<string, Cell>()
  private characters = new Map<string, CharacterData>()
  private listeners = new Set<(event: WorldEvent) => void>()

  constructor(data: WorldData) {
    const world = parseWorld(data)
    this.width = world.size.width
    this.depth = world.size.depth
    this.height = world.size.height
    this.maxJump = world.maxJump ?? 1
    this.load(world)
  }

  static empty(width = 10, depth = 10, height = 6): World {
    return new World({
      version: 1,
      size: { width, depth, height },
      cells: [],
      characters: [{ id: 'klonk', model: 'male', x: 0, z: 0, direction: 'south' }],
    })
  }

  // ---------------------------------------------------------------------------
  // Ereignisse

  on(listener: (event: WorldEvent) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: WorldEvent) {
    for (const listener of this.listeners) listener(event)
  }

  // ---------------------------------------------------------------------------
  // Laden & Speichern

  private load(data: WorldData) {
    this.cells.clear()
    this.characters.clear()
    for (const cell of data.cells) {
      this.assertInside(cell)
      this.cells.set(key(cell), {
        bricks: [...(cell.bricks ?? [])].slice(0, this.height),
        mark: cell.mark ?? null,
        block: !!cell.block,
      })
    }
    for (const character of data.characters) {
      this.assertInside(character)
      if (this.characters.has(character.id)) throw new WorldError('invalid_world', { reason: 'duplicate_character' })
      this.characters.set(character.id, { ...character })
    }
  }

  /** Zustand zurücksetzen (z. B. vor jedem Programmlauf) */
  reset(data: WorldData) {
    this.load(parseWorld(data))
    this.emit({ type: 'reset' })
  }

  toJSON(): WorldData {
    const cells: CellData[] = []
    for (const [k, cell] of this.cells) {
      if (!cell.bricks.length && !cell.mark && !cell.block) continue
      const { x, z } = parseKey(k)
      cells.push({
        x,
        z,
        ...(cell.bricks.length ? { bricks: [...cell.bricks] } : {}),
        ...(cell.mark ? { mark: cell.mark } : {}),
        ...(cell.block ? { block: true } : {}),
      })
    }
    cells.sort((a, b) => a.z - b.z || a.x - b.x)
    return {
      version: 1,
      size: { width: this.width, depth: this.depth, height: this.height },
      maxJump: this.maxJump,
      cells,
      characters: [...this.characters.values()].map(c => ({ ...c })),
    }
  }

  // ---------------------------------------------------------------------------
  // Abfragen

  isInside({ x, z }: Position) {
    return Number.isInteger(x) && Number.isInteger(z) && x >= 0 && z >= 0 && x < this.width && z < this.depth
  }

  cell(position: Position): Readonly<Cell> {
    return this.cells.get(key(position)) ?? { bricks: [], mark: null, block: false }
  }

  /** Anzahl Ziegel auf dem Feld (Quader zählen als volle Höhe) */
  levelAt(position: Position) {
    const cell = this.cell(position)
    return cell.block ? this.height : cell.bricks.length
  }

  getCharacters(): readonly CharacterData[] {
    return [...this.characters.values()]
  }

  getCharacter(id: string): Readonly<CharacterData> {
    const character = this.characters.get(id)
    if (!character) throw new WorldError('unknown_character', { id })
    return character
  }

  characterAt(position: Position) {
    return [...this.characters.values()].find(c => c.x === position.x && c.z === position.z)
  }

  /** Feld vor der Figur */
  front(id: string): Position {
    const c = this.getCharacter(id)
    const offset = OFFSETS[c.direction]
    return { x: c.x + offset.x, z: c.z + offset.z }
  }

  /** Vor der Figur ist der Rand der Welt oder ein Quader */
  isWall(id: string) {
    const front = this.front(id)
    return !this.isInside(front) || this.cell(front).block
  }

  /** Vor der Figur liegt mindestens ein Ziegel (optional mit dieser Farbe obenauf) */
  isBrick(id: string, color?: BrickColor) {
    const front = this.front(id)
    if (!this.isInside(front)) return false
    const bricks = this.cell(front).bricks
    return color ? bricks.at(-1) === color : bricks.length > 0
  }

  /** Die Figur steht auf einer Marke (optional dieser Farbe) */
  isMark(id: string, color?: MarkColor) {
    const mark = this.cell(this.getCharacter(id)).mark
    return color ? mark === color : mark !== null
  }

  /** Anzahl Ziegel vor der Figur */
  bricksInFront(id: string) {
    const front = this.front(id)
    return this.isInside(front) ? this.cell(front).bricks.length : 0
  }

  // ---------------------------------------------------------------------------
  // Befehle der Figuren

  /** Ein Feld nach vorn; Höhenunterschiede bis `maxJump` Ziegel werden überstiegen */
  step(id: string) {
    const c = this.mutableCharacter(id)
    const to = this.front(id)
    if (!this.isInside(to)) throw new WorldError('wall', { x: c.x, z: c.z, direction: c.direction })
    if (this.cell(to).block) throw new WorldError('block', { x: to.x, z: to.z })
    const fromY = this.levelAt(c)
    const toY = this.levelAt(to)
    if (Math.abs(toY - fromY) > this.maxJump) throw new WorldError('too_high', { x: to.x, z: to.z, height: toY - fromY })
    if (this.characterAt(to)) throw new WorldError('occupied', { x: to.x, z: to.z })

    const from = { x: c.x, z: c.z, y: fromY }
    c.x = to.x
    c.z = to.z
    this.emit({ type: 'move', id, from, to: { ...to, y: toY } })
  }

  turnLeft(id: string) {
    this.turn(id, -1)
  }

  turnRight(id: string) {
    this.turn(id, 1)
  }

  private turn(id: string, delta: number) {
    const c = this.mutableCharacter(id)
    c.direction = DIRECTIONS[(DIRECTIONS.indexOf(c.direction) + delta + 4) % 4]!
    this.emit({ type: 'turn', id, direction: c.direction })
  }

  /** Legt einen Ziegel auf das Feld vor der Figur */
  placeBrick(id: string, color: BrickColor = 'red') {
    const to = this.front(id)
    if (!this.isInside(to)) throw new WorldError('wall', { x: to.x, z: to.z })
    const cell = this.mutableCell(to)
    if (cell.block) throw new WorldError('block', { x: to.x, z: to.z })
    if (cell.bricks.length >= this.height) throw new WorldError('stack_full', { x: to.x, z: to.z, height: this.height })
    cell.bricks.push(color)
    this.emit({ type: 'brick-placed', at: to, color, level: cell.bricks.length - 1 })
  }

  /** Nimmt den obersten Ziegel vor der Figur weg */
  pickBrick(id: string) {
    const from = this.front(id)
    if (!this.isInside(from)) throw new WorldError('wall', { x: from.x, z: from.z })
    const cell = this.mutableCell(from)
    if (!cell.bricks.length) throw new WorldError('no_brick', { x: from.x, z: from.z })
    cell.bricks.pop()
    this.emit({ type: 'brick-removed', at: from, level: cell.bricks.length })
  }

  /** Markiert das Feld, auf dem die Figur steht */
  setMark(id: string, color: MarkColor = 'yellow') {
    const c = this.getCharacter(id)
    this.mutableCell(c).mark = color
    this.emit({ type: 'mark-set', at: { x: c.x, z: c.z }, color })
  }

  removeMark(id: string) {
    const c = this.getCharacter(id)
    const cell = this.mutableCell(c)
    if (!cell.mark) throw new WorldError('no_mark', { x: c.x, z: c.z })
    cell.mark = null
    this.emit({ type: 'mark-removed', at: { x: c.x, z: c.z } })
  }

  // ---------------------------------------------------------------------------
  // Bearbeiten (Welt-Editor)

  /** Ziegel direkt auf ein Feld legen (Editor) */
  addBrickAt(position: Position, color: BrickColor) {
    this.assertInside(position)
    const cell = this.mutableCell(position)
    if (cell.block) throw new WorldError('block', position)
    if (cell.bricks.length >= this.height) throw new WorldError('stack_full', { ...position, height: this.height })
    cell.bricks.push(color)
    this.emit({ type: 'brick-placed', at: { ...position }, color, level: cell.bricks.length - 1 })
  }

  removeBrickAt(position: Position) {
    this.assertInside(position)
    const cell = this.mutableCell(position)
    if (!cell.bricks.length) throw new WorldError('no_brick', position)
    cell.bricks.pop()
    this.emit({ type: 'brick-removed', at: { ...position }, level: cell.bricks.length })
  }

  setMarkAt(position: Position, color: MarkColor | null) {
    this.assertInside(position)
    this.mutableCell(position).mark = color
    this.emit(color ? { type: 'mark-set', at: { ...position }, color } : { type: 'mark-removed', at: { ...position } })
  }

  setBlockAt(position: Position, block: boolean) {
    this.assertInside(position)
    if (block && this.characterAt(position)) throw new WorldError('occupied', position)
    const cell = this.mutableCell(position)
    cell.block = block
    if (block) cell.bricks = []
    this.emit({ type: 'block-set', at: { ...position }, block })
  }

  addCharacter(character: CharacterData, maxCharacters = Infinity) {
    this.assertInside(character)
    if (this.characters.size >= maxCharacters) throw new WorldError('character_limit', { max: maxCharacters })
    if (this.characters.has(character.id)) throw new WorldError('invalid_world', { reason: 'duplicate_character' })
    if (this.cell(character).block) throw new WorldError('block', character)
    if (this.characterAt(character)) throw new WorldError('occupied', character)
    this.characters.set(character.id, { ...character })
    this.emit({ type: 'character-added', character: { ...character } })
  }

  removeCharacter(id: string) {
    this.getCharacter(id)
    this.characters.delete(id)
    this.emit({ type: 'character-removed', id })
  }

  // ---------------------------------------------------------------------------

  private mutableCharacter(id: string) {
    return this.getCharacter(id) as CharacterData
  }

  private mutableCell(position: Position) {
    const k = key(position)
    let cell = this.cells.get(k)
    if (!cell) {
      cell = { bricks: [], mark: null, block: false }
      this.cells.set(k, cell)
    }
    return cell
  }

  private assertInside(position: Position) {
    if (!this.isInside(position)) throw new WorldError('wall', { x: position.x, z: position.z })
  }
}

export function createCharacter(model: CharacterModel, position: Position, direction: Direction = 'south', id?: string): CharacterData {
  return { id: id ?? `${model}-${position.x}-${position.z}`, model, direction, ...position }
}

function key({ x, z }: Position) {
  return `${x}:${z}`
}

function parseKey(k: string): Position {
  const [x, z] = k.split(':').map(Number)
  return { x: x!, z: z! }
}
