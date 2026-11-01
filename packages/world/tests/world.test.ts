import { describe, expect, it } from 'vitest'
import { World, WorldError, type WorldData, type WorldEvent } from '../src'

const base = (extra: Partial<WorldData> = {}): WorldData => ({
  version: 1,
  size: { width: 5, depth: 4, height: 3 },
  cells: [],
  characters: [{ id: 'k', model: 'male', x: 0, z: 0, direction: 'east' }],
  ...extra,
})

function expectError(fn: () => void, code: string) {
  try {
    fn()
  }
  catch (e) {
    expect(e).toBeInstanceOf(WorldError)
    expect((e as WorldError).code).toBe(code)
    return
  }
  throw new Error(`Erwarteter Fehler ${code} blieb aus`)
}

describe('Bewegen und Drehen', () => {
  it('läuft nach vorn und dreht sich', () => {
    const w = new World(base())
    w.step('k')
    expect(w.getCharacter('k')).toMatchObject({ x: 1, z: 0 })
    w.turnRight('k')
    expect(w.getCharacter('k').direction).toBe('south')
    w.step('k')
    expect(w.getCharacter('k')).toMatchObject({ x: 1, z: 1 })
    w.turnLeft('k')
    w.turnLeft('k')
    expect(w.getCharacter('k').direction).toBe('north')
  })

  it('stößt an den Rand der Welt', () => {
    const w = new World(base())
    w.turnLeft('k')
    expect(w.isWall('k')).toBe(true)
    expectError(() => w.step('k'), 'wall')
  })

  it('Quader sind Hindernisse', () => {
    const w = new World(base({ cells: [{ x: 1, z: 0, block: true }] }))
    expect(w.isWall('k')).toBe(true)
    expectError(() => w.step('k'), 'block')
    expectError(() => w.placeBrick('k'), 'block')
  })

  it('steigt höchstens einen Ziegel hoch oder runter', () => {
    const w = new World(base({ cells: [{ x: 1, z: 0, bricks: ['red'] }, { x: 2, z: 0, bricks: ['red', 'red', 'blue'] }] }))
    w.step('k')
    expectError(() => w.step('k'), 'too_high')
  })

  it('Figuren können nicht auf dasselbe Feld', () => {
    const w = new World(base({ characters: [
      { id: 'a', model: 'male', x: 0, z: 0, direction: 'east' },
      { id: 'b', model: 'female', x: 1, z: 0, direction: 'west' },
    ] }))
    expectError(() => w.step('a'), 'occupied')
  })
})

describe('Ziegel und Marken', () => {
  it('legt Ziegel vor sich und hebt sie auf', () => {
    const w = new World(base())
    w.placeBrick('k', 'blue')
    w.placeBrick('k')
    expect(w.bricksInFront('k')).toBe(2)
    expect(w.isBrick('k', 'red')).toBe(true)
    expect(w.isBrick('k', 'blue')).toBe(false)
    w.pickBrick('k')
    expect(w.isBrick('k', 'blue')).toBe(true)
    w.pickBrick('k')
    expectError(() => w.pickBrick('k'), 'no_brick')
  })

  it('Stapel sind durch die Welthöhe begrenzt', () => {
    const w = new World(base())
    for (let i = 0; i < 3; i++) w.placeBrick('k')
    expectError(() => w.placeBrick('k'), 'stack_full')
  })

  it('markiert das eigene Feld', () => {
    const w = new World(base())
    expect(w.isMark('k')).toBe(false)
    w.setMark('k', 'red')
    expect(w.isMark('k', 'red')).toBe(true)
    expect(w.isMark('k', 'yellow')).toBe(false)
    w.removeMark('k')
    expectError(() => w.removeMark('k'), 'no_mark')
  })
})

describe('Ereignisse, Editor und Format', () => {
  it('meldet Änderungen für die Darstellung', () => {
    const w = new World(base({ cells: [{ x: 1, z: 0, bricks: ['red'] }] }))
    const events: WorldEvent[] = []
    w.on(e => events.push(e))
    w.step('k')
    w.placeBrick('k', 'green')
    expect(events).toEqual([
      { type: 'move', id: 'k', from: { x: 0, z: 0, y: 0 }, to: { x: 1, z: 0, y: 1 } },
      { type: 'brick-placed', at: { x: 2, z: 0 }, color: 'green', level: 0 },
    ])
  })

  it('speichert und lädt verlustfrei', () => {
    const w = new World(base())
    w.addBrickAt({ x: 3, z: 3 }, 'yellow')
    w.setMarkAt({ x: 2, z: 1 }, 'blue')
    w.setBlockAt({ x: 4, z: 0 }, true)
    const copy = new World(JSON.parse(JSON.stringify(w.toJSON())))
    expect(copy.toJSON()).toEqual(w.toJSON())
    expect(copy.toJSON().cells).toEqual([
      { x: 4, z: 0, block: true },
      { x: 2, z: 1, mark: 'blue' },
      { x: 3, z: 3, bricks: ['yellow'] },
    ])
  })

  it('begrenzt die Anzahl der Figuren (kostenlose Version: eine)', () => {
    const w = new World(base())
    expectError(() => w.addCharacter({ id: 'b', model: 'diverse', x: 2, z: 2, direction: 'north' }, 1), 'character_limit')
    w.addCharacter({ id: 'b', model: 'diverse', x: 2, z: 2, direction: 'north' })
    expect(w.getCharacters()).toHaveLength(2)
  })

  it('lehnt ungültige Welten ab', () => {
    expectError(() => new World({ ...base(), size: { width: 0, depth: 1, height: 1 } }), 'invalid_world')
    expectError(() => new World(base({ cells: [{ x: 9, z: 0 }] })), 'wall')
    expectError(() => new World({ ...base(), version: 2 } as unknown as WorldData), 'invalid_world')
  })

  it('reset stellt den Ausgangszustand her', () => {
    const start = base()
    const w = new World(start)
    w.step('k')
    w.placeBrick('k')
    w.reset(start)
    expect(w.toJSON()).toEqual({ ...start, maxJump: 1 })
  })
})
