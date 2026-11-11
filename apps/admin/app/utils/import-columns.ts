/**
 * Hilfen für den Import von Listen (Konten anlegen, Gruppen zuordnen): Spalten anhand der Überschrift erkennen,
 * Namen zerlegen, Benutzernamen bilden.
 */

export type ColumnRole = 'firstName' | 'lastName' | 'fullName' | 'username' | 'password' | 'group' | 'role'

const HEADER_HINTS: Record<ColumnRole, RegExp> = {
  firstName: /^(vorname|vornamen|rufname|first ?name|given ?name)$/i,
  lastName: /^(nachname|familienname|zuname|last ?name|surname|family ?name)$/i,
  fullName: /^(name|vollständiger name|anzeigename|schüler(in)?|full ?name|display ?name)$/i,
  username: /^(benutzername|benutzer|anmeldename|login|kennung|user ?name|user|e-?mail|mail)$/i,
  password: /^(passwort|kennwort|startpasswort|password)$/i,
  group: /^(klasse|klassen|gruppe|gruppen|kurs|kurse|class|group|groups|course)$/i,
  role: /^(rolle|funktion|role)$/i,
}

/** Sieht die erste Zeile wie Überschriften aus? */
export function looksLikeHeader(row: string[] | undefined) {
  return !!row?.some(cell => Object.values(HEADER_HINTS).some(re => re.test(cell.trim())))
}

/** Spalten den Rollen zuordnen (nur Überschriften, die eindeutig passen) */
export function detectColumns(header: string[]): Partial<Record<ColumnRole, number>> {
  const found: Partial<Record<ColumnRole, number>> = {}
  header.forEach((cell, index) => {
    for (const [role, re] of Object.entries(HEADER_HINTS) as [ColumnRole, RegExp][]) {
      if (found[role] === undefined && re.test(cell.trim())) {
        found[role] = index
        break
      }
    }
  })
  return found
}

/** „Muster, Max“ bzw. „Max Muster“ ⇒ Vor- und Nachname */
export function splitName(full: string): { first: string, last: string } {
  const text = full.trim().replace(/\s+/g, ' ')
  if (text.includes(',')) {
    const [last, first] = text.split(',', 2).map(s => s.trim())
    return { first: first ?? '', last: last ?? '' }
  }
  const parts = text.split(' ')
  if (parts.length < 2) return { first: '', last: text }
  return { first: parts.slice(0, -1).join(' '), last: parts.at(-1)! }
}

/** Text ⇒ erlaubter Teil eines Benutzernamens (a–z, 0–9, . _ -; Umlaute als ae/oe/ue/ss) */
export function usernamePart(text: string) {
  return text.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9._-]/g, '')
}

export type UsernamePattern = 'firstLast' | 'initialLast' | 'lastFirst' | 'column'
export const USERNAME_PATTERNS: UsernamePattern[] = ['firstLast', 'initialLast', 'lastFirst', 'column']
export const USERNAME_SEPARATORS = ['.', '_', '-', ''] as const

/** Benutzername nach Muster; aus einer Spalte mit E-Mail-Adresse zählt nur der Teil vor dem @ */
export function buildUsername(pattern: UsernamePattern, separator: string, name: { first: string, last: string }, column = '') {
  if (pattern === 'column') return usernamePart(column.split('@')[0] ?? '')
  const first = usernamePart(name.first.split(' ')[0] ?? '')
  const last = usernamePart(name.last)
  if (!last) return first
  if (!first) return last
  if (pattern === 'initialLast') return `${first[0]}${separator}${last}`
  if (pattern === 'lastFirst') return `${last}${separator}${first}`
  return `${first}${separator}${last}`
}

export const isValidUsername = (name: string) => /^[a-z0-9._-]{2,64}$/.test(name)

/** Rolle aus Text der Rollenspalte (Lehrkraft, Ausbilder:in, Admin …), sonst die Vorgabe */
export function roleFromText(text: string, fallback: MemberRole): MemberRole {
  const t = text.toLowerCase()
  if (/admin/.test(t)) return 'admin'
  if (/lehr|teach|ausbild|trainer|leitung/.test(t)) return 'teacher'
  if (/schül|lern|student|pupil|azubi|auszubild|mitarbeit|member/.test(t)) return 'member'
  return fallback
}

/** Mehrere Gruppen in einer Zelle: „5a, Informatik-AG“ */
export const splitGroups = (cell: string) => cell.split(/[,;|]/).map(s => s.trim()).filter(Boolean)

/** Gut lesbares Zufallspasswort (ohne 0/O/1/l/I) */
export function randomPassword(length = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const values = crypto.getRandomValues(new Uint32Array(length))
  return [...values].map(v => chars[v % chars.length]).join('')
}

/** Namen für den Abgleich vereinheitlichen (Groß-/Kleinschreibung, Akzente, Leerzeichen) */
export const normalizeName = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

/** CSV-Datei (Semikolon, mit BOM – öffnet sich in Excel richtig) herunterladen */
export function downloadCsv(name: string, rows: string[][]) {
  const text = rows.map(row => row.map(cell => /[;"\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
