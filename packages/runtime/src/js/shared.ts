/**
 * Gemeinsamer Speicher zwischen Hauptthread und Worker für JS/TS: Der Nutzercode läuft synchron,
 * deshalb gehen Pause, Fortsetzen, Tempo und Haltepunkte nicht über Nachrichten, sondern über Atomics.
 */
export const CONTROL = {
  /** 1 = Pause angefordert */
  PAUSE: 0,
  /** Worker wartet hier, solange 0; Hauptthread setzt 1 = weiter, 2 = Einzelschritt */
  SIGNAL: 1,
  /** Pause nach Roboterbefehlen in ms */
  DELAY: 2,
  /** Immer 0 – nur zum Schlafen mit Atomics.wait */
  SLEEP: 3,
} as const

const CONTROL_BYTES = 64
export const MAX_LINES = 20_000

export function createSharedState() {
  return new SharedArrayBuffer(CONTROL_BYTES + MAX_LINES)
}

export function views(buffer: SharedArrayBuffer) {
  return {
    control: new Int32Array(buffer, 0, CONTROL_BYTES / 4),
    /** Haltepunkte: Index = Zeile, 1 = gesetzt */
    breakpoints: new Uint8Array(buffer, CONTROL_BYTES, MAX_LINES),
  }
}

export function writeBreakpoints(buffer: SharedArrayBuffer, lines: number[]) {
  const { breakpoints } = views(buffer)
  breakpoints.fill(0)
  for (const line of lines) if (line > 0 && line < MAX_LINES) breakpoints[line] = 1
}
