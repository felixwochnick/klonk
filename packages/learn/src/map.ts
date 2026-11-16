import type { BrickColor, CellData, CharacterData, CharacterModel, Direction, MarkColor, WorldData } from '@klonk/world'

const ARROWS: Record<string, Direction> = { '^': 'north', '>': 'east', 'v': 'south', '<': 'west' }
const MARKS: Record<string, MarkColor> = { y: 'yellow', r: 'red', b: 'blue', g: 'green' }
const BRICKS: Record<string, BrickColor> = { R: 'red', B: 'blue', Y: 'yellow', G: 'green', O: 'orange', P: 'purple', W: 'white', K: 'black' }
const MODELS: CharacterModel[] = ['male', 'female', 'diverse']

/**
 * Aufgabenwelt als Textkarte: eine Zeile je Reihe (Norden oben), Felder durch Leerzeichen getrennt.
 * `.` leer · `#` Quader · `>` `<` `^` `v` Figur mit Blickrichtung · `y` `r` `b` `g` Marke ·
 * Ziffer = so viele rote Ziegel · Großbuchstabe = ein Ziegel dieser Farbe (`R` `B` `Y` `G` `O` `P` `W` `K`, von unten nach oben). Zeichen lassen sich kombinieren, z. B. `>y` (Figur auf gelber Marke).
 * Mehrere Figuren heißen der Reihe nach (zeilenweise) wie in `names`, sonst Klonk.
 */
export function map(rows: string, options: { height?: number, names?: string[] } = {}): WorldData {
  const lines = rows.trim().split('\n').map(line => line.trim().split(/\s+/))
  const cells: CellData[] = []
  const characters: CharacterData[] = []
  const names = options.names ?? ['Klonk']
  lines.forEach((tokens, z) => tokens.forEach((token, x) => {
    const cell: CellData = { x, z }
    for (const char of token) {
      if (char === '.') continue
      if (char === '#') cell.block = true
      else if (ARROWS[char]) {
        const i = characters.length
        characters.push({ id: names[i] ?? `Klonk ${i + 1}`, model: MODELS[i % MODELS.length]!, x, z, direction: ARROWS[char] })
      }
      else if (MARKS[char]) cell.mark = MARKS[char]
      else if (/\d/.test(char)) cell.bricks = [...cell.bricks ?? [], ...Array.from({ length: Number(char) }, () => 'red' as const)]
      else if (BRICKS[char]) cell.bricks = [...cell.bricks ?? [], BRICKS[char]]
      else throw new Error(`Unbekanntes Zeichen „${char}“ in der Karte`)
    }
    if (cell.block || cell.mark || cell.bricks) cells.push(cell)
  }))
  if (characters.length !== names.length) throw new Error(`Karte braucht ${names.length} Figur(en)`)
  return {
    version: 1,
    size: { width: Math.max(...lines.map(l => l.length)), depth: lines.length, height: options.height ?? 6 },
    cells,
    characters,
  }
}
