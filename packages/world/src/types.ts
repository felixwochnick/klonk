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

/** Zubehör auf dem Kopf (Designs) */
export const ACCESSORIES = ['none', 'cap', 'hat', 'helmet', 'crown'] as const
export type Accessory = typeof ACCESSORIES[number]

/** Eigenes Aussehen einer Figur (Datei `*.klonkdesign.json`, lizenzpflichtig): Grundform + Farben + Zubehör */
export type RobotDesign = {
  version: 1
  /** Bezeichnung des Designs (nicht der Figur – die heißt über ihre ID) */
  name?: string
  base: CharacterModel
  colors: { skin: string, shirt: string, pants: string, hair: string, eyes: string, accessory?: string }
  accessory?: Accessory
}

/** Farben der Standardmodelle (wie in assets/blender/build_models.py) */
export const DEFAULT_DESIGNS: Record<CharacterModel, RobotDesign> = {
  male: { version: 1, base: 'male', colors: { skin: '#e8b48a', shirt: '#0055bf', pants: '#3a3a3a', hair: '#5b3a1e', eyes: '#1b1b1b' }, accessory: 'none' },
  female: { version: 1, base: 'female', colors: { skin: '#e8b48a', shirt: '#c91a09', pants: '#1f3b70', hair: '#b98a3e', eyes: '#1b1b1b' }, accessory: 'none' },
  diverse: { version: 1, base: 'diverse', colors: { skin: '#e8b48a', shirt: '#237841', pants: '#c9b48a', hair: '#6b2f86', eyes: '#1b1b1b' }, accessory: 'none' },
}

export type CharacterData = Position & {
  /** Name der Figur – identifiziert sie (eindeutig, ohne Groß-/Kleinschreibung) */
  id: string
  /** Aussehen: Standardmodell … */
  model: CharacterModel
  /** … oder eigenes Design (eingebettet, damit Welten für sich stehen) */
  design?: RobotDesign
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
