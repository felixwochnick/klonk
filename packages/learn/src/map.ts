import type { CellData, CharacterData, Direction, MarkColor, WorldData } from '@klonk/world'

const ARROWS: Record<string, Direction> = { '^': 'north', '>': 'east', 'v': 'south', '<': 'west' }
const MARKS: Record<string, MarkColor> = { y: 'yellow', r: 'red', b: 'blue', g: 'green' }

/**
 * Aufgabenwelt als Textkarte: eine Zeile je Reihe (Norden oben), Felder durch Leerzeichen getrennt.
 * `.` leer · `#` Quader · `>` `<` `^` `v` Klonk mit Blickrichtung · `y` `r` `b` `g` Marke ·
 * Ziffer = so viele rote Ziegel. Zeichen lassen sich kombinieren, z. B. `>y` (Klonk auf gelber Marke).
 */
export function map(rows: string, options: { height?: number } = {}): WorldData {
  const lines = rows.trim().split('\n').map(line => line.trim().split(/\s+/))
  const cells: CellData[] = []
  const characters: CharacterData[] = []
  lines.forEach((tokens, z) => tokens.forEach((token, x) => {
    const cell: CellData = { x, z }
    for (const char of token) {
      if (char === '.') continue
      if (char === '#') cell.block = true
      else if (ARROWS[char]) characters.push({ id: 'Klonk', model: 'male', x, z, direction: ARROWS[char] })
      else if (MARKS[char]) cell.mark = MARKS[char]
      else if (/\d/.test(char)) cell.bricks = Array.from({ length: Number(char) }, () => 'red' as const)
      else throw new Error(`Unbekanntes Zeichen „${char}“ in der Karte`)
    }
    if (cell.block || cell.mark || cell.bricks) cells.push(cell)
  }))
  if (characters.length !== 1) throw new Error('Karte braucht genau eine Figur')
  return {
    version: 1,
    size: { width: Math.max(...lines.map(l => l.length)), depth: lines.length, height: options.height ?? 6 },
    cells,
    characters,
  }
}
