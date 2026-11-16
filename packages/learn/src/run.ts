import type { WorldData } from '@klonk/world'
import { checkedSchema, checkedTables } from './check'
import type { LearnTask, Outcome, SchemaTable, SqlRow } from './types'

/**
 * Datenbank, auf der eine Aufgabe läuft – in der App eine `DatabaseSession` (Datenbank-Worker), in den Tests SQLite
 * direkt. Nur, was die Prüfung braucht.
 */
export interface LearnSqlSession {
  script: (sql: string) => Promise<{ columns: string[], rows: SqlRow[] }[]>
  query: (sql: string) => Promise<{ columns: string[], rows: SqlRow[] }>
  tables: () => Promise<(SchemaTable & { kind?: string })[]>
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`

/** Inhalt der geprüften Tabellen – gesucht in allen Datenbanken des Laufs (fehlt eine, fehlt sie im Ergebnis) */
export async function collectTables(task: LearnTask, lang: 'de' | 'en', sessions: LearnSqlSession[]): Promise<Outcome['tables']> {
  const names = checkedTables(task.check, lang)
  if (!names.length) return undefined
  const tables: NonNullable<Outcome['tables']> = {}
  for (const name of names) {
    for (const session of sessions) {
      const found = (await session.tables()).find(t => t.name.toLowerCase() === name.toLowerCase())
      if (!found) continue
      const result = await session.query(`SELECT * FROM ${quote(found.name)}`)
      tables[name] = { columns: result.columns, rows: result.rows }
      break
    }
  }
  return tables
}

/** Aufbau der geprüften Tabellen */
export async function collectSchema(task: LearnTask, lang: 'de' | 'en', session: LearnSqlSession): Promise<SchemaTable[] | undefined> {
  const names = checkedSchema(task.check, lang).map(n => n.toLowerCase())
  if (!names.length) return undefined
  return (await session.tables()).filter(t => names.includes(t.name.toLowerCase()))
    .map(t => ({ name: t.name, columns: t.columns.map(c => ({ name: c.name, type: c.type, primaryKey: c.primaryKey, notNull: c.notNull })), foreignKeys: t.foreignKeys ?? [] }))
}

/**
 * Ergebnis einer SQL-Aufgabe: Skript auf der frischen Datenbank ausführen (SQL-Fehler werfen), letztes Ergebnis mit
 * Spalten, bei der Welt-Datenbank die geänderte Welt (`readWorld`), dazu geprüfte Tabellen und Schema.
 */
export async function sqlOutcome(task: LearnTask, lang: 'de' | 'en', session: LearnSqlSession, sql: string, start: WorldData | null, readWorld?: () => Promise<WorldData>): Promise<Outcome> {
  const results = await session.script(sql)
  const last = [...results].reverse().find(r => r.columns.length)
  return {
    world: task.worldDatabase && readWorld ? await readWorld() : start,
    output: [],
    result: last ? { columns: last.columns, rows: last.rows } : null,
    tables: await collectTables(task, lang, [session]),
    schema: await collectSchema(task, lang, session),
  }
}
