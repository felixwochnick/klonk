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

/** Zubehör am Kopf (Designs) – Modelle in `outfits.glb` (assets/blender/build_models.py) */
export const ACCESSORIES = ['none', 'cap', 'hat', 'helmet', 'crown', 'beanie', 'headphones', 'glasses', 'chefHat', 'cowboyHat', 'wizardHat', 'pirateHat', 'spaceHelmet', 'knightHelmet', 'bow'] as const
export type Accessory = typeof ACCESSORIES[number]

/** Standardfarbe je Zubehör (wie in build_models.py), solange das Design keine eigene setzt */
export const ACCESSORY_COLORS: Record<Exclude<Accessory, 'none'>, string> = {
  cap: '#0055bf',
  hat: '#1b1b1b',
  helmet: '#f2cd37',
  crown: '#f2cd37',
  beanie: '#c91a09',
  headphones: '#3a3a3a',
  glasses: '#1b1b1b',
  chefHat: '#f4f4f4',
  cowboyHat: '#a5713f',
  wizardHat: '#3c2a7a',
  pirateHat: '#1b1b1b',
  spaceHelmet: '#f4f4f4',
  knightHelmet: '#aeb4ba',
  bow: '#e4789c',
}

/** Kleidung (Skins) über der Figur – ebenfalls in `outfits.glb` */
export const SKINS = ['none', 'worker', 'doctor', 'chef', 'police', 'firefighter', 'astronaut', 'knight', 'pirate', 'farmer'] as const
export type Skin = typeof SKINS[number]

/** Hauptfarbe je Skin (Warnweste, Kittel …), solange das Design keine eigene setzt */
export const SKIN_COLORS: Record<Exclude<Skin, 'none'>, string> = {
  worker: '#ff7a1a',
  doctor: '#f4f4f4',
  chef: '#f4f4f4',
  police: '#1f2a44',
  firefighter: '#26324a',
  astronaut: '#f4f4f4',
  knight: '#aeb4ba',
  pirate: '#5a1f1f',
  farmer: '#3d5f8f',
}

/** Passende Vorgaben beim Wählen eines Skins (Oberteil/Hose unter der Kleidung, Zubehör) */
export const SKIN_PRESETS: Record<Exclude<Skin, 'none'>, { shirt: string, pants: string, accessory: Accessory }> = {
  worker: { shirt: '#3b5b7d', pants: '#2b3a55', accessory: 'helmet' },
  doctor: { shirt: '#7fa8d1', pants: '#3a4a5a', accessory: 'glasses' },
  chef: { shirt: '#f4f4f4', pants: '#2b2b2b', accessory: 'chefHat' },
  police: { shirt: '#2d4a7a', pants: '#1f2a44', accessory: 'cap' },
  firefighter: { shirt: '#26324a', pants: '#26324a', accessory: 'helmet' },
  astronaut: { shirt: '#f4f4f4', pants: '#f4f4f4', accessory: 'spaceHelmet' },
  knight: { shirt: '#6b6f75', pants: '#3a3a3a', accessory: 'knightHelmet' },
  pirate: { shirt: '#f1ead8', pants: '#2b2b2b', accessory: 'pirateHat' },
  farmer: { shirt: '#b33a3a', pants: '#3d5f8f', accessory: 'cowboyHat' },
}

/** Eigenes Aussehen einer Figur (Datei `*.klonkdesign.json`, lizenzpflichtig): Grundform + Farben + Kleidung + Zubehör */
export type RobotDesign = {
  version: 1
  /** Bezeichnung des Designs (nicht der Figur – die heißt über ihre ID) */
  name?: string
  base: CharacterModel
  colors: { skin: string, shirt: string, pants: string, hair: string, eyes: string, accessory?: string, outfit?: string }
  skin?: Skin
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
