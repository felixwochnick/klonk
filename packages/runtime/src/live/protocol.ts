import type { RobotCommand } from '@klonk/klonk-script'
import type { WorldData } from '@klonk/world'

/**
 * Nachrichten der gemeinsamen Welt (WebSocket, JSON). Der Server hält die maßgebliche Welt; jede:r steuert die eigene
 * Figur, alle sehen alle Befehle in derselben Reihenfolge.
 */

/** Person im Raum: Figur (`null` = zuschauend, z. B. Lehrkraft), online, Farbe für Markierungen */
export type LivePlayer = { userId: string, name: string, figure: string | null, online: boolean, spectator: boolean, color: string }

export type LiveWorldServerMessage
  /** Nach dem Beitreten: aktuelle Welt, eigene Rolle */
  = | { t: 'welcome', world: WorldData, you: { userId: string, figure: string | null, spectator: boolean }, players: LivePlayer[] }
  /** Bestätigter Befehl (`ref` nur an die Person, die ihn geschickt hat) */
    | { t: 'cmd', command: RobotCommand, by: string, ref?: number }
  /** Abgelehnter Befehl (Fehler wie in einer eigenen Welt, z. B. `wall`, oder `live_not_owner`) */
    | { t: 'reject', ref: number, code: string, params: Record<string, string | number> }
  /** Ganze Welt neu (zurückgesetzt bzw. auf Wunsch abgeglichen); `by` = wer zurückgesetzt hat */
    | { t: 'world', world: WorldData, reason: 'reset' | 'sync', by?: string }
    | { t: 'players', players: LivePlayer[] }
  /** Eigene Figur hat sich geändert (nach dem Zurücksetzen) */
    | { t: 'you', figure: string | null }

export type LiveWorldClientMessage
  = | { t: 'cmd', ref: number, command: RobotCommand }
    | { t: 'reset' }
    | { t: 'sync' }

/** Farben für Personen (Figurenschild, Cursor im gemeinsamen Projekt) – kräftig, in hell und dunkel lesbar */
export const LIVE_COLORS = ['#e5484d', '#0090ff', '#30a46c', '#f76b15', '#8e4ec6', '#12a594', '#d6409f', '#ad7f58', '#3e63dd', '#e54666'] as const

/** Feste Farbe je Konto (gleich in allen Räumen) */
export function liveColor(userId: string) {
  let hash = 0
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return LIVE_COLORS[hash % LIVE_COLORS.length]!
}
