import type { WorldData } from '@klonk/world'

/**
 * Unterrichtsmaterial als neutrales Dokumentmodell: Arbeitsblätter/Lösungsblätter (A4) und Präsentationen (16:9).
 * Die Bausteine kommen aus den Lernmodulen (`worksheet.ts`, `slides.ts`), die Ausgabe übernehmen `html.ts` (Vorschau,
 * Drucken bzw. PDF über den Browser), `docx.ts` und `pptx.ts` (Bearbeiten in Euro-Office, LibreOffice, Word, PowerPoint).
 */

/** Teil einer Zeile: Text, `code` oder **fett** */
export type Inline = { kind: 'text' | 'code' | 'bold', value: string }
export type Line = Inline[]

/**
 * Bild einer Welt: `world` = 3D-Ansicht (erzeugt die App mit dem Renderer), `plan` = Draufsicht bzw. Bauplan
 * (`worldPlanSvg`). Gleiche Welt und Art ⇒ gleiche `id`, die Ausgabe bekommt die fertigen Bilder je `id`.
 */
export type MaterialImage = { id: string, kind: 'world' | 'plan', world: WorldData, caption?: string }

/** Fertiges Bild für die Ausgabe: `src` für HTML (SVG oder PNG), `png` für DOCX/PPTX (Data-URL), Größe in Pixeln */
export type ResolvedImage = { src: string, png: string, width: number, height: number }
export type ImageMap = Record<string, ResolvedImage | undefined>

export type MaterialTable = { columns: string[], rows: string[][], caption?: string, more?: number }

export type MaterialBlock
  = | { type: 'heading', level: 1 | 2 | 3, text: string }
    | { type: 'paragraph', lines: Line[], muted?: boolean }
    | { type: 'list', items: Line[], check?: boolean }
    | { type: 'code', code: string }
    /** Bildzeilen: Bilder einer Zeile sind gleich hoch und füllen zusammen die ganze Breite */
    | { type: 'images', rows: MaterialImage[][], note?: string }
    | { type: 'table', table: MaterialTable }
    /**
     * Platz zum Schreiben: `count` Linien; `code` = Programm (Kasten mit Zeilennummern), optional zwischen vorgegebenem
     * Anfang und Ende (Startvorlage der Programmiersprache, z. B. Java-Klasse). `label` steht darüber und bleibt mit dem
     * Kasten auf einer Seite.
     */
    | { type: 'lines', count: number, label?: string, code?: boolean, before?: string, after?: string, indent?: number }
    | { type: 'box', tone: 'info' | 'hint' | 'solution' | 'teacher', title: string, blocks: MaterialBlock[] }
    /** Felder zum Ausfüllen (Name, Klasse, Datum) */
    | { type: 'fields', labels: string[] }
    | { type: 'pageBreak' }

export type MaterialKind = 'worksheet' | 'solutions' | 'slides'

/** Arbeitsblatt bzw. Lösungsblatt (A4 hoch) */
export type MaterialDocument = {
  kind: 'worksheet' | 'solutions'
  lang: 'de' | 'en'
  /** Kürzel des Moduls (E1 …, eigene Module auch leer) */
  code: string
  title: string
  /** „Arbeitsblatt“, „Lösungen“ */
  label: string
  /** Kopfzeile links (Schule) */
  school?: string
  /** Fußzeile links, z. B. „Klonk · E1 Wege finden“ */
  footer: string
  /** „Seite {page} von {pages}“ – Platzhalter bleiben für die Ausgabe stehen */
  pageLabel: string
  blocks: MaterialBlock[]
}

/** Folie: Text links, Bilder rechts (ohne Bilder volle Breite) */
export type Slide = {
  layout: 'title' | 'section' | 'content'
  /** Kleine Zeile über dem Titel (z. B. „Aufgabe 2“) */
  kicker?: string
  title: string
  subtitle?: string
  blocks: MaterialBlock[]
  images: MaterialImage[]
  /** Sprechernotizen (Hinweise für Lehrkräfte, Tipps, Lösung) */
  notes?: string
}

export type Presentation = {
  kind: 'slides'
  lang: 'de' | 'en'
  code: string
  title: string
  label: string
  school?: string
  footer: string
  slides: Slide[]
}

/** Alle Bilder eines Dokuments (ohne Doppelte) – die App erzeugt sie vor der Ausgabe */
export function collectImages(content: MaterialDocument | Presentation): MaterialImage[] {
  const found = new Map<string, MaterialImage>()
  const walk = (blocks: MaterialBlock[]) => {
    for (const block of blocks) {
      if (block.type === 'images') for (const image of block.rows.flat()) found.set(image.id, image)
      else if (block.type === 'box') walk(block.blocks)
    }
  }
  if (content.kind === 'slides') {
    for (const slide of content.slides) {
      walk(slide.blocks)
      for (const image of slide.images) found.set(image.id, image)
    }
  }
  else walk(content.blocks)
  return [...found.values()]
}

/** Kurzer, stabiler Schlüssel (FNV-1a) – für Bild-IDs */
export function hashText(text: string) {
  let hash = 0x811C9DC5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

/** Seitenverhältnis (Breite / Höhe) eines Bilds; fehlende Bilder als 4 : 3 */
export function imageRatio(image: MaterialImage, images: ImageMap) {
  const resolved = images[image.id]
  return resolved && resolved.width > 0 && resolved.height > 0 ? resolved.width / resolved.height : 4 / 3
}

export function worldImage(kind: MaterialImage['kind'], world: WorldData, caption?: string): MaterialImage {
  return { id: `${kind}-${hashText(JSON.stringify(world))}`, kind, world, caption }
}

/** Reiner Text einer Zeile (Sprechernotizen, Dateinamen) */
export const plainLine = (line: Line) => line.map(part => part.value).join('')
