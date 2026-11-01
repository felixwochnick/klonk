/** Himmelsrichtungen: Norden = -z, Osten = +x, Süden = +z, Westen = -x */
export const DIRECTIONS = ['north', 'east', 'south', 'west'] as const
export type Direction = typeof DIRECTIONS[number]

export const BRICK_COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'white', 'black'] as const
export type BrickColor = typeof BRICK_COLORS[number]

export const MARK_COLORS = ['yellow', 'red', 'blue', 'green'] as const
export type MarkColor = typeof MARK_COLORS[number]

/** Figuren in Klemmbaustein-Optik (Modelle aus Blender) */
export const CHARACTER_MODELS = ['male', 'female', 'diverse'] as const
export type CharacterModel = typeof CHARACTER_MODELS[number]

export type Position = { x: number, z: number }

export type CellData = Position & {
  /** Ziegelstapel von unten nach oben */
  bricks?: BrickColor[]
  mark?: MarkColor | null
  /** Fester Quader: nicht begehbar, nicht stapelbar */
  block?: boolean
}

export type CharacterData = Position & {
  id: string
  model: CharacterModel
  direction: Direction
}

/** Serialisiertes Weltformat (Dateien `*.klonkworld.json`) */
export type WorldData = {
  version: 1
  size: { width: number, depth: number, height: number }
  /** Wie hoch eine Figur steigen kann (Ziegel) */
  maxJump?: number
  cells: CellData[]
  characters: CharacterData[]
}
