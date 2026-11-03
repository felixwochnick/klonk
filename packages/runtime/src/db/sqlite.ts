import type { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { SqlError, lineAt, toSqlValue, type SqlEngine, type SqlForeignKey, type SqlResult, type SqlTable, type SqlValue } from './types'

let module: Promise<Sqlite3Static> | undefined

/** sqlite-wasm einmal laden (Wasm liegt neben dem Modul, Vite liefert es von der eigenen Origin) */
function sqlite() {
  // Ausgaben der Laufzeit (z. B. Hinweise zu OPFS) unterdrücken – wir nutzen nur Datenbanken im Speicher
  module ??= import('@sqlite.org/sqlite-wasm').then(m => (m.default as (options: object) => Promise<Sqlite3Static>)({ print: () => {}, printErr: () => {} }))
  return module
}

/** Skript in einzelne Anweisungen teilen (sqlite3_complete kennt Zeichenketten, Kommentare und Trigger-Rümpfe) */
export function splitStatements(sqlite3: Sqlite3Static, sql: string) {
  const statements: { sql: string, offset: number }[] = []
  let start = 0
  for (let i = 0; i < sql.length; i++) {
    if (sql[i] !== ';') continue
    const candidate = sql.slice(start, i + 1)
    if (!sqlite3.capi.sqlite3_complete(candidate)) continue
    pushStatement(statements, candidate, start)
    start = i + 1
  }
  // Letzte Anweisung ohne Semikolon
  pushStatement(statements, sql.slice(start), start)
  return statements
}

function pushStatement(statements: { sql: string, offset: number }[], text: string, offset: number) {
  // Nur Kommentare/Leerraum ⇒ keine Anweisung
  const stripped = text.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/;/g, '').trim()
  if (!stripped) return
  const lead = text.length - text.trimStart().length
  statements.push({ sql: text.trim(), offset: offset + lead })
}

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`

/** `initial`: SQL-Text (Datenbankdatei im Projekt) oder eine SQLite-Datei (`.db`, Import) */
export async function createSqlite(initial?: string | Uint8Array): Promise<SqlEngine> {
  const sqlite3 = await sqlite()
  const db: Database = new sqlite3.oo1.DB(':memory:', 'c')
  if (initial instanceof Uint8Array) {
    const pointer = sqlite3.wasm.allocFromTypedArray(initial)
    const { SQLITE_DESERIALIZE_FREEONCLOSE, SQLITE_DESERIALIZE_RESIZEABLE } = sqlite3.capi
    const rc = sqlite3.capi.sqlite3_deserialize(db.pointer!, 'main', pointer, initial.byteLength, initial.byteLength, SQLITE_DESERIALIZE_FREEONCLOSE | SQLITE_DESERIALIZE_RESIZEABLE)
    // Keine SQLite-Datei ⇒ Fehler erst bei der ersten Abfrage, daher gleich prüfen
    if (rc || !isDatabase(db)) {
      db.close()
      throw new SqlError('not_a_database')
    }
  }

  function run(sql: string, params: SqlValue[] | undefined, maxRows: number): SqlResult {
    const stmt = db.prepare(sql)
    try {
      if (params?.length) stmt.bind(params.map(p => (typeof p === 'object' && p !== null ? JSON.stringify(p) : p)) as never)
      // getColumnNames() wirft bei Anweisungen ohne Spalten
      const columns = stmt.columnCount ? stmt.getColumnNames() : []
      const rows: SqlValue[][] = []
      let truncated = false
      const before = db.changes(true)
      while (stmt.step()) {
        if (rows.length >= maxRows) {
          truncated = true
          continue
        }
        rows.push((stmt.get([]) as unknown[]).map(toSqlValue))
      }
      // Nur schreibende Anweisungen melden geänderte Zeilen (SELECT hat Spalten, DDL ändert nichts)
      const changed = columns.length ? null : db.changes(true) - before
      return { columns, rows, changes: changed, sql, ...(truncated ? { truncated } : {}) }
    }
    finally {
      stmt.finalize()
    }
  }

  const engine: SqlEngine = {
    engine: 'sqlite',
    async script(sql, options) {
      const results: SqlResult[] = []
      for (const statement of splitStatements(sqlite3, sql)) {
        try {
          results.push(run(statement.sql, undefined, options?.maxRows ?? 1000))
        }
        catch (error) {
          throw new SqlError(cleanMessage(error), lineAt(sql, statement.offset), results)
        }
      }
      return results
    },
    async query(sql, params, options) {
      try {
        return run(sql, params, options?.maxRows ?? 100_000)
      }
      catch (error) {
        throw new SqlError(cleanMessage(error))
      }
    },
    async dump() {
      const lines = ['PRAGMA foreign_keys=OFF;', 'BEGIN TRANSACTION;']
      const objects = db.exec({
        sql: `SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, rowid`,
        rowMode: 'object',
        returnValue: 'resultRows',
      }) as { type: string, name: string, sql: string }[]
      for (const object of objects) {
        lines.push(`${object.sql};`)
        if (object.type !== 'table') continue
        const columns = db.exec({ sql: `SELECT name FROM pragma_table_info(?)`, bind: [object.name], rowMode: 0, returnValue: 'resultRows' }) as string[]
        if (!columns.length) continue
        const values = columns.map(c => `quote(${quoteIdent(c)})`).join(` || ',' || `)
        const inserts = db.exec({ sql: `SELECT 'INSERT INTO ' || ? || ' VALUES(' || ${values} || ');' FROM ${quoteIdent(object.name)}`, bind: [quoteIdent(object.name)], rowMode: 0, returnValue: 'resultRows' }) as string[]
        lines.push(...inserts)
      }
      // Stand von AUTOINCREMENT
      const hasSequence = db.selectValue(`SELECT count(*) FROM sqlite_schema WHERE name = 'sqlite_sequence'`)
      if (hasSequence) {
        const sequences = db.exec({ sql: `SELECT 'INSERT INTO sqlite_sequence VALUES(' || quote(name) || ',' || seq || ');' FROM sqlite_sequence`, rowMode: 0, returnValue: 'resultRows' }) as string[]
        if (sequences.length) lines.push('DELETE FROM sqlite_sequence;', ...sequences)
      }
      lines.push('COMMIT;')
      return `${lines.join('\n')}\n`
    },
    async tables() {
      const objects = db.exec({
        sql: `SELECT name, type FROM sqlite_schema WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name`,
        rowMode: 'object',
        returnValue: 'resultRows',
      }) as { name: string, type: 'table' | 'view' }[]
      return objects.map((object): SqlTable => {
        const columns = db.exec({ sql: 'SELECT name, type, pk, "notnull" FROM pragma_table_info(?)', bind: [object.name], rowMode: 'object', returnValue: 'resultRows' }) as { name: string, type: string, pk: number, notnull: number }[]
        const rows = object.type === 'table' ? Number(db.selectValue(`SELECT count(*) FROM ${quoteIdent(object.name)}`)) : null
        // Fremdschlüssel (für das ER-Diagramm) und eindeutige Einzelspalten (1:1-Beziehungen)
        const fkRows = db.exec({ sql: 'SELECT id, "table", "from", "to" FROM pragma_foreign_key_list(?) ORDER BY id, seq', bind: [object.name], rowMode: 'object', returnValue: 'resultRows' }) as { id: number, table: string, from: string, to: string | null }[]
        const foreignKeys = new Map<number, SqlForeignKey>()
        for (const fk of fkRows) {
          const entry = foreignKeys.get(fk.id) ?? { columns: [], table: fk.table, refColumns: [] }
          entry.columns.push(fk.from)
          if (fk.to) entry.refColumns.push(fk.to)
          foreignKeys.set(fk.id, entry)
        }
        const unique = new Set((db.exec({
          sql: `SELECT ii.name FROM pragma_index_list(?) il JOIN pragma_index_info(il.name) ii WHERE il."unique" = 1 AND il.origin != 'pk'
                AND (SELECT count(*) FROM pragma_index_info(il.name)) = 1`,
          bind: [object.name],
          rowMode: 0,
          returnValue: 'resultRows',
        }) as string[]))
        return {
          name: object.name,
          kind: object.type,
          rows,
          columns: columns.map(c => ({ name: c.name, type: c.type, primaryKey: c.pk > 0, notNull: !!c.notnull, unique: unique.has(c.name) || undefined })),
          foreignKeys: [...foreignKeys.values()],
        }
      })
    },
    async exportFile() {
      return sqlite3.capi.sqlite3_js_db_export(db.pointer!)
    },
    async close() {
      db.close()
    },
  }

  if (typeof initial === 'string' && initial.trim()) {
    try {
      db.exec(initial)
    }
    catch (error) {
      db.close()
      throw new SqlError(cleanMessage(error))
    }
  }
  // Fremdschlüssel prüfen wie in anderen Datenbanken (SQLite hat das sonst aus)
  db.exec('PRAGMA foreign_keys=ON;')
  return engine
}

function isDatabase(db: Database) {
  try {
    db.selectValue('SELECT count(*) FROM sqlite_schema')
    return true
  }
  catch {
    return false
  }
}

/** „SQLITE_ERROR: sqlite3 result code 1: no such table: x“ ⇒ „no such table: x“ */
function cleanMessage(error: unknown) {
  const text = String((error as Error)?.message ?? error)
  return text.replace(/^SQLITE_\w+:\s*(sqlite3 result code \d+:\s*)?/, '')
}
