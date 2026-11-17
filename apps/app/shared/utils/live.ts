/**
 * Zusammenarbeit in Untergruppen über eine WebSocket-Verbindung je Raum (`/_live?project=<id>` bzw. `?world=<id>`).
 * Alle Nachrichten sind binär, das erste Byte sagt die Art: Yjs-Abgleich und Anwesenheit (wie y-websocket) für das
 * gemeinsame Projekt, JSON für Steuerung und die gemeinsame Welt.
 */
export const LIVE_KIND = { sync: 0, awareness: 1, json: 2 } as const

/** Gemeinsames Projekt: Steuernachrichten (JSON) */
export type LiveProjectClientMessage
  /** Datei öffnen – der Server lädt sie bei Bedarf aus der Cloud in das gemeinsame Dokument */
  = | { t: 'open', path: string, content?: string }
  /** Datei gespeichert ⇒ die anderen holen den neuen Stand gleich ab (Ungespeichert-Punkt verschwindet) */
    | { t: 'saved', path: string }
  /** Dateien/Ordner angelegt, umbenannt oder gelöscht ⇒ die anderen gleichen gleich ab */
    | { t: 'files', removed?: string[] }

export type LiveProjectServerMessage
  = | { t: 'welcome', userId: string, name: string, color: string, writable: boolean }
    | { t: 'opened', path: string }
    | { t: 'saved', path: string, by: string }
    | { t: 'files', by: string }

/** Anwesenheit im gemeinsamen Projekt (Yjs-Awareness): wer, in welcher Datei, wo der Cursor steht */
export type LiveAwarenessState = {
  user: { id: string, name: string, color: string }
  path?: string | null
  /** Auswahl als relative Yjs-Positionen (JSON), nur in Textdateien */
  selection?: { anchor: unknown, head: unknown } | null
}

/** Blöcke im gemeinsamen Dokument: je oberstem Block ein Eintrag `b:<id>`, dazu `rest` (Variablen …) */
export const BLOCK_PREFIX = 'b:'

/** Blockly-Arbeitsbereich (JSON-Text) ⇒ Einträge je oberstem Block */
export function splitWorkspace(text: string): Record<string, string> {
  let data: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(text || '{}') as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as Record<string, unknown>
  }
  catch {
    // ungültig ⇒ leer
  }
  const { blocks, ...rest } = data
  const entries: Record<string, string> = { rest: JSON.stringify(rest) }
  const list = (blocks as { blocks?: unknown[] } | undefined)?.blocks
  for (const [index, block] of (Array.isArray(list) ? list : []).entries()) {
    if (!block || typeof block !== 'object') continue
    // Gespeicherte Arbeitsbereiche ohne IDs (z. B. Startbeispiele): einmal fest vergeben, sonst hätte jede:r andere
    const given = (block as { id?: unknown }).id
    const id = typeof given === 'string' && given ? given : `start-${index}-${Math.random().toString(36).slice(2, 10)}`
    entries[`${BLOCK_PREFIX}${id}`] = JSON.stringify({ ...block, id })
  }
  return entries
}

/** Einträge je oberstem Block ⇒ Blockly-Arbeitsbereich (Objekt) */
export function joinWorkspace(entries: Iterable<[string, string]>): Record<string, unknown> {
  let rest: Record<string, unknown> = {}
  const blocks: unknown[] = []
  for (const [key, value] of entries) {
    try {
      if (key === 'rest') rest = JSON.parse(value) as Record<string, unknown>
      else if (key.startsWith(BLOCK_PREFIX)) blocks.push(JSON.parse(value))
    }
    catch {
      // kaputter Eintrag ⇒ weglassen
    }
  }
  return blocks.length ? { ...rest, blocks: { languageVersion: 0, blocks } } : rest
}

/** Dateien, die im gemeinsamen Projekt live bearbeitet werden (Text in Monaco bzw. Blöcke) */
export function liveFileKind(path: string): 'text' | 'blocks' | null {
  if (path.endsWith('.blocks')) return 'blocks'
  return /\.(klonk|js|ts|py|java|cs)$/.test(path) ? 'text' : null
}
