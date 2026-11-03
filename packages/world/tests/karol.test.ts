import { describe, expect, it } from 'vitest'
import { convertKarolWorld, World } from '../src'

describe('Robot Karol: Welten', () => {
  it('übernimmt Größe, Ziegel, Quader, Marken und Karol', () => {
    // 3 × 2 Felder, Höhe 2, spaltenweise: (0,0) (0,1) (1,0) (1,1) (2,0) (2,1); Karol auf (2,1) mit Blick nach Norden
    const { world, warnings } = convertKarolWorld('KarolVersion2Deutsch 3 2 2 2 1 2 z n o  n n m  q q o  n n o  z z o  n n o')
    expect(world.size).toEqual({ width: 3, depth: 2, height: 2 })
    expect(world.cells).toEqual([
      { x: 0, z: 0, bricks: ['red'] },
      { x: 0, z: 1, mark: 'yellow' },
      { x: 1, z: 0, block: true },
      { x: 2, z: 0, bricks: ['red', 'red'] },
    ])
    expect(world.characters).toEqual([{ id: 'Karol', model: 'male', x: 2, z: 1, direction: 'north' }])
    expect(warnings).toEqual([])
    expect(() => new World(world)).not.toThrow()
  })

  it('liest Robot Karol 3.0 (Zusatzangaben am Ende) und meldet Unbekanntes', () => {
    const { world, warnings } = convertKarolWorld('KarolVersion3.0 1 1 2 0 0 0 z x o 1 1 S')
    expect(world.characters[0]!.direction).toBe('south')
    expect(world.cells).toEqual([{ x: 0, z: 0, bricks: ['red', 'red'] }])
    expect(warnings).toEqual([{ code: 'unknown_entry', count: 1, entry: 'x' }])
  })

  it('lehnt fremde, unvollständige und zu große Dateien ab', () => {
    expect(() => convertKarolWorld('Hallo Welt')).toThrow()
    expect(() => convertKarolWorld('KarolVersion2Deutsch 2 2 1 0 0 0 n o')).toThrow()
    expect(() => convertKarolWorld(`KarolVersion2Deutsch 90 90 1 0 0 0 ${'n o '.repeat(8100)}`)).toThrow()
  })
})
