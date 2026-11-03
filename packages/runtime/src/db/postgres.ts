import type { PGlite } from '@electric-sql/pglite'
import { SqlError, lineAt, toSqlValue, type SqlEngine, type SqlResult, type SqlTable, type SqlValue } from './types'

type PgError = Error & { position?: string }

/**
 * PostgreSQL im Browser (PGlite, im Speicher). Wasm und Daten lädt PGlite neben dem Modul (eigene Origin),
 * Sicherung über pg_dump (`--inserts`, damit der Text ohne COPY wieder einlesbar ist).
 */
export async function createPostgres(initial?: string): Promise<SqlEngine> {
  const { PGlite } = await import('@electric-sql/pglite')
  const pg: PGlite = await PGlite.create()

  const toResult = (result: { rows: unknown[], fields: { name: string }[], affectedRows?: number }, maxRows: number, hasRows: boolean): SqlResult => {
    const rows = (result.rows as unknown[][]).slice(0, maxRows).map(row => row.map(toSqlValue))
    return {
      columns: result.fields.map(f => f.name),
      rows,
      changes: hasRows ? null : result.affectedRows ?? 0,
      ...(result.rows.length > maxRows ? { truncated: true } : {}),
    }
  }

  const fail = (error: unknown, sql: string, results: SqlResult[] = []) => {
    const e = error as PgError
    const position = Number(e?.position)
    return new SqlError(String(e?.message ?? error), position ? lineAt(sql, position - 1) : null, results)
  }

  const engine: SqlEngine = {
    engine: 'postgres',
    async script(sql, options) {
      try {
        const results = await pg.exec(sql, { rowMode: 'array' })
        return results.map(r => toResult(r, options?.maxRows ?? 1000, r.fields.length > 0))
      }
      catch (error) {
        throw fail(error, sql)
      }
    },
    async query(sql, params, options) {
      try {
        const result = await pg.query(sql, (params ?? []).map(serialize), { rowMode: 'array' })
        return toResult(result, options?.maxRows ?? 100_000, result.fields.length > 0)
      }
      catch (error) {
        throw fail(error, sql)
      }
    },
    async dump() {
      const { pgDump } = await import('@electric-sql/pglite-tools/pg_dump')
      const file = await pgDump({ pg, args: ['--inserts', '--no-owner', '--no-privileges'] })
      // pg_dump setzt search_path in der Sitzung leer – sonst fänden spätere Abfragen ohne Schema nichts
      await pg.exec('RESET search_path;')
      return tidyDump(await file.text())
    },
    async tables() {
      const result = await pg.query<{ name: string, kind: string, columns: { name: string, type: string, pk: boolean, notnull: boolean }[] }>(`
        SELECT c.relname AS name, c.relkind AS kind,
          coalesce(json_agg(json_build_object('name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
            'pk', coalesce(i.indisprimary, false), 'notnull', a.attnotnull) ORDER BY a.attnum) FILTER (WHERE a.attnum > 0), '[]') AS columns
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
        LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        LEFT JOIN pg_index i ON i.indrelid = c.oid AND i.indisprimary AND a.attnum = ANY(i.indkey)
        WHERE c.relkind IN ('r', 'v', 'p')
        GROUP BY c.oid, c.relname, c.relkind
        ORDER BY c.relname`)
      const tables: SqlTable[] = []
      for (const row of result.rows) {
        const kind = row.kind === 'v' ? 'view' : 'table'
        const count = kind === 'table' ? await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${row.name.replace(/"/g, '""')}"`) : null
        tables.push({ name: row.name, kind, rows: count?.rows[0]?.n ?? null, columns: row.columns.map(c => ({ name: c.name, type: c.type, primaryKey: c.pk, notNull: c.notnull })) })
      }
      return tables
    },
    async close() {
      await pg.close()
    },
  }

  if (initial?.trim()) {
    try {
      await pg.exec(initial)
      await pg.exec('RESET search_path;')
    }
    catch (error) {
      await pg.close()
      throw fail(error, initial)
    }
  }
  return engine
}

/** Objekte/Listen als JSON übergeben (z. B. für json-Spalten), alles andere wie es ist */
function serialize(value: SqlValue) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? JSON.stringify(value) : value
}

/** pg_dump-Ausgabe lesbar halten: Kopfkommentare und leere SET-Zeilen bleiben, doppelte Leerzeilen nicht */
function tidyDump(text: string) {
  return `${text.replace(/\n{3,}/g, '\n\n').trim()}\n`
}
