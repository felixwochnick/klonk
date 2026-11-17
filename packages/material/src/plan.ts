import type { BrickColor, Direction, MarkColor, WorldData } from '@klonk/world'

/** Farben wie im 3D-Renderer bzw. in `build_models.py` */
const BRICK_HEX: Record<BrickColor, string> = {
  red: '#C91A09',
  blue: '#0055BF',
  yellow: '#F2CD37',
  green: '#237841',
  orange: '#FE8A18',
  purple: '#81007B',
  white: '#F4F4F4',
  black: '#1B2A34',
}
const MARK_HEX: Record<MarkColor, string> = { yellow: '#F2CD37', red: '#C91A09', blue: '#0055BF', green: '#4B9F4A' }
const ROTATION: Record<Direction, number> = { north: 0, east: 90, south: 180, west: 270 }
const DARK_TEXT = new Set<BrickColor>(['yellow', 'white', 'orange'])

const escape = (text: string) => text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

export type PlanOptions = {
  /** Feldnummern am Rand (x oben, y links – ab 1 wie `positionX`/`positionY`) */
  coordinates?: boolean
  /** Kantenlänge eines Felds in Pixeln */
  cell?: number
}

/**
 * Draufsicht einer Welt als SVG – zugleich Bauplan: Norden oben, Zahl im Ziegel = Ziegel übereinander, Pfeil = Figur
 * mit Blickrichtung, getönte Felder = Marken, dunkle Felder mit Kreuz = Quader. Druckfreundlich (weißer Grund), damit
 * Lernende auf dem Arbeitsblatt Wege einzeichnen können.
 */
export function worldPlanSvg(world: WorldData, options: PlanOptions = {}): { svg: string, width: number, height: number } {
  const size = options.cell ?? 48
  const coordinates = options.coordinates ?? true
  const pad = coordinates ? Math.round(size * 0.5) : 2
  const { width, depth } = world.size
  const w = pad + width * size + 2
  const h = pad + depth * size + 2
  const parts: string[] = []
  const x0 = (x: number) => pad + x * size
  const z0 = (z: number) => pad + z * size
  const font = 'font-family="Arial, Helvetica, sans-serif"'

  parts.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/>`)
  if (coordinates) {
    for (let x = 0; x < width; x++) parts.push(`<text x="${x0(x) + size / 2}" y="${pad * 0.7}" ${font} font-size="${Math.round(size * 0.27)}" fill="#6b7280" text-anchor="middle">${x + 1}</text>`)
    for (let z = 0; z < depth; z++) parts.push(`<text x="${pad * 0.5}" y="${z0(z) + size / 2 + size * 0.1}" ${font} font-size="${Math.round(size * 0.27)}" fill="#6b7280" text-anchor="middle">${z + 1}</text>`)
  }
  // Raster
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) parts.push(`<rect x="${x0(x)}" y="${z0(z)}" width="${size}" height="${size}" fill="#ffffff" stroke="#8a918d" stroke-width="1.5"/>`)
  }
  const occupied = new Set(world.characters.map(c => `${c.x},${c.z}`))
  for (const cell of world.cells) {
    const x = x0(cell.x)
    const y = z0(cell.z)
    if (cell.mark) {
      const inset = size * 0.06
      parts.push(`<rect x="${x + inset}" y="${y + inset}" width="${size - 2 * inset}" height="${size - 2 * inset}" rx="${size * 0.08}" fill="${MARK_HEX[cell.mark]}" fill-opacity="0.75" stroke="${MARK_HEX[cell.mark]}" stroke-width="2"/>`)
    }
    if (cell.block) {
      const inset = size * 0.08
      parts.push(`<rect x="${x + inset}" y="${y + inset}" width="${size - 2 * inset}" height="${size - 2 * inset}" rx="${size * 0.06}" fill="#6C6E68" stroke="#3f413d" stroke-width="1.5"/>`)
      parts.push(`<path d="M${x + inset * 2} ${y + inset * 2} L${x + size - inset * 2} ${y + size - inset * 2} M${x + size - inset * 2} ${y + inset * 2} L${x + inset * 2} ${y + size - inset * 2}" stroke="#d6d8d4" stroke-width="2"/>`)
    }
    const bricks = cell.bricks ?? []
    if (bricks.length) {
      const top = bricks.at(-1)!
      const inset = size * 0.16
      parts.push(`<rect x="${x + inset}" y="${y + inset}" width="${size - 2 * inset}" height="${size - 2 * inset}" rx="${size * 0.08}" fill="${BRICK_HEX[top]}" stroke="#1f2937" stroke-width="1.5"/>`)
      const color = DARK_TEXT.has(top) ? '#111827' : '#ffffff'
      // Steht eine Figur darauf, wandert die Zahl in die Ecke
      if (occupied.has(`${cell.x},${cell.z}`)) parts.push(`<text x="${x + size * 0.2}" y="${y + size * 0.3}" ${font} font-size="${Math.round(size * 0.22)}" font-weight="bold" fill="${color}">${bricks.length}</text>`)
      else parts.push(`<text x="${x + size / 2}" y="${y + size / 2 + size * 0.13}" ${font} font-size="${Math.round(size * 0.38)}" font-weight="bold" fill="${color}" text-anchor="middle">${bricks.length}</text>`)
    }
  }
  const several = world.characters.length > 1
  for (const character of world.characters) {
    const cx = x0(character.x) + size / 2
    const cy = z0(character.z) + size / 2
    const s = size / 100
    parts.push(`<g transform="translate(${cx} ${cy}) rotate(${ROTATION[character.direction]})"><path d="M0 ${-36 * s} L${28 * s} ${30 * s} L0 ${16 * s} L${-28 * s} ${30 * s} Z" fill="#1B2A34" stroke="#ffffff" stroke-width="${3 * s}" stroke-linejoin="round"/></g>`)
    if (several) {
      const label = escape(character.id.slice(0, 1).toUpperCase())
      parts.push(`<circle cx="${x0(character.x) + size * 0.8}" cy="${z0(character.z) + size * 0.2}" r="${size * 0.15}" fill="#ffffff" stroke="#1B2A34" stroke-width="1.2"/>`)
      parts.push(`<text x="${x0(character.x) + size * 0.8}" y="${z0(character.z) + size * 0.2 + size * 0.07}" ${font} font-size="${Math.round(size * 0.2)}" font-weight="bold" fill="#1B2A34" text-anchor="middle">${label}</text>`)
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join('')}</svg>`
  return { svg, width: w, height: h }
}
