import type { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { writeDbResponse } from '../src/db/channel'
import { toSqlValue } from '../src/db/types'
import type { DbRequest, DbResponse, FromWorker } from '../src/protocol'

/**
 * Synchrone Datenbank-Gegenstelle für Tests: Im Browser beantwortet der Hauptthread die Anfragen asynchron, in Node
 * blockiert Atomics.wait aber denselben Thread – deshalb hier echtes SQLite synchron, Antwort noch vor dem Warten.
 * Projektdatenbank „schule“ mit Tabelle schueler.
 */
export async function createTestDatabases() {
  const sqlite3 = await (await import('@sqlite.org/sqlite-wasm')).default() as Sqlite3Static
  const handles = new Map<number, { db: Database, name: string }>()
  let next = 1

  const open = (name: string) => {
    const db = new sqlite3.oo1.DB(':memory:', 'c')
    if (name === 'schule') db.exec(`CREATE TABLE schueler (id INTEGER PRIMARY KEY, name TEXT NOT NULL, klasse TEXT, note REAL);
      INSERT INTO schueler VALUES (1, 'Mia', '7a', 1.5), (2, 'Ben', '7b', 2.0), (3, 'Ali', '7a', NULL);`)
    const handle = next++
    handles.set(handle, { db, name })
    return { ok: true as const, handle, name, engine: 'sqlite' as const }
  }

  const answer = (request: DbRequest): DbResponse => {
    switch (request.op) {
      case 'open':
        return request.name.toLowerCase() === 'schule' ? open('schule') : { ok: false, code: 'db_not_found', params: { name: request.name } }
      case 'memory':
        return open('memory')
      case 'tables': {
        const { db } = handles.get(request.handle)!
        return { ok: true, tables: db.exec({ sql: `SELECT name FROM sqlite_schema WHERE type IN ('table','view') ORDER BY name`, rowMode: 0, returnValue: 'resultRows' }) as string[] }
      }
      case 'query': {
        const { db } = handles.get(request.handle)!
        try {
          const stmt = db.prepare(request.sql)
          try {
            if (request.params.length) stmt.bind(request.params as never)
            const columns = stmt.columnCount ? stmt.getColumnNames() : []
            const rows: unknown[][] = []
            while (stmt.step()) rows.push((stmt.get([]) as unknown[]).map(toSqlValue))
            return { ok: true, result: { columns, rows: rows as never, changes: columns.length ? null : db.changes() } }
          }
          finally {
            stmt.finalize()
          }
        }
        catch (error) {
          return { ok: false, code: 'sql_error', params: { message: String((error as Error).message).replace(/^SQLITE_\w+:\s*(sqlite3 result code \d+:\s*)?/, '') } }
        }
      }
    }
  }

  /** `post` für die Läufe: Datenbankanfragen sofort beantworten, alles andere sammeln */
  return (buffer: SharedArrayBuffer, messages: FromWorker[]) => (message: FromWorker) => {
    if (message.type === 'db') writeDbResponse(buffer, answer(message.request))
    else messages.push(message)
  }
}
