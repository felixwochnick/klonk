/** Datenbank-Engines im Browser: SQLite (sqlite-wasm) und PostgreSQL (PGlite) */
export const SQL_ENGINES = ['sqlite', 'postgres'] as const
export type SqlEngineName = typeof SQL_ENGINES[number]

/** Werte, wie sie an Programme und Oberfläche gehen (JSON-tauglich: Datum als ISO-Text, Binärdaten als Hex) */
export type SqlValue = string | number | boolean | null | SqlValue[] | { [key: string]: SqlValue }

export type SqlResult = {
  columns: string[]
  rows: SqlValue[][]
  /** Geänderte Zeilen (INSERT/UPDATE/DELETE), sonst null */
  changes: number | null
  /** Anweisung (nur SQLite – PostgreSQL liefert die Ergebnisse ohne Text) */
  sql?: string
  /** Mehr Zeilen als angezeigt */
  truncated?: boolean
}

export type SqlColumn = { name: string, type: string, primaryKey: boolean, notNull: boolean, unique?: boolean }
/** Fremdschlüssel: Spalten dieser Tabelle ⇒ Spalten der Zieltabelle */
export type SqlForeignKey = { columns: string[], table: string, refColumns: string[] }
export type SqlTable = { name: string, kind: 'table' | 'view', columns: SqlColumn[], rows: number | null, foreignKeys?: SqlForeignKey[] }

/** SQL-Fehler mit Zeile im Skript (falls bekannt) und den Ergebnissen davor */
export class SqlError extends Error {
  constructor(message: string, public readonly line: number | null = null, public readonly results: SqlResult[] = []) {
    super(message)
  }
}

export interface SqlEngine {
  readonly engine: SqlEngineName
  /** Mehrere Anweisungen ohne Parameter (Konsole, Laden einer Datenbankdatei) */
  script: (sql: string, options?: { maxRows?: number }) => Promise<SqlResult[]>
  /** Eine Anweisung mit Parametern (Programme: SQLite `?`, PostgreSQL `$1`) */
  query: (sql: string, params?: SqlValue[], options?: { maxRows?: number }) => Promise<SqlResult>
  /** Gesamter Inhalt als SQL-Text (Schema + Daten) – so liegen Datenbanken im Projekt */
  dump: () => Promise<string>
  tables: () => Promise<SqlTable[]>
  /** Als SQLite-Datei (nur SQLite) */
  exportFile?: () => Promise<Uint8Array>
  close: () => Promise<void>
}

/** Zeile (1-basiert) einer Zeichenposition */
export function lineAt(text: string, offset: number) {
  let line = 1
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

/** Werte aus den Engines vereinheitlichen */
export function toSqlValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'bigint') return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString()
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? String(value) : value.toISOString()
  if (value instanceof Uint8Array) return `\\x${Array.from(value, b => b.toString(16).padStart(2, '0')).join('')}`
  if (Array.isArray(value)) return value.map(toSqlValue)
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toSqlValue(v)]))
  return String(value)
}
