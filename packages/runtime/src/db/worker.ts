/// <reference lib="webworker" />
import type { WorldData } from '@klonk/world'
import { createPostgres } from './postgres'
import { createSqlite } from './sqlite'
import { SqlError, type SqlEngine } from './types'
import { WorldTableError, sqlToWorld, worldToSql } from './world'
import type { DbWorkerRequest, DbWorkerResponse } from './client'

// Datenbanken der Sitzung (Projektdatenbanken, Welt, temporäre aus Programmen) – abseits der Oberfläche,
// damit große Abfragen und das Laden von PGlite nicht ruckeln
const engines = new Map<number, SqlEngine>()
let nextHandle = 1

function engine(handle: number) {
  const found = engines.get(handle)
  if (!found) throw new SqlError('closed')
  return found
}

async function handle(request: DbWorkerRequest): Promise<unknown> {
  switch (request.op) {
    case 'open': {
      const initial = request.world ? worldToSql(request.world.data, request.world.lang) : request.initial
      const created = request.engine === 'postgres'
        ? await createPostgres(typeof initial === 'string' ? initial : undefined)
        : await createSqlite(initial)
      const id = nextHandle++
      engines.set(id, created)
      return id
    }
    case 'script':
      return engine(request.handle).script(request.sql, { maxRows: request.maxRows })
    case 'query':
      return engine(request.handle).query(request.sql, request.params, { maxRows: request.maxRows })
    case 'dump':
      return engine(request.handle).dump()
    case 'tables':
      return engine(request.handle).tables()
    case 'export': {
      const found = engine(request.handle)
      if (!found.exportFile) throw new SqlError('export_unsupported')
      return found.exportFile()
    }
    case 'readWorld':
      return sqlToWorld(engine(request.handle), request.previous as WorldData, request.lang)
    case 'close': {
      const found = engines.get(request.handle)
      engines.delete(request.handle)
      await found?.close()
      return null
    }
  }
}

self.onmessage = async (event: MessageEvent<DbWorkerRequest>) => {
  const request = event.data
  let response: DbWorkerResponse
  try {
    response = { id: request.id, ok: true, value: await handle(request) }
  }
  catch (error) {
    response = {
      id: request.id,
      ok: false,
      error: error instanceof WorldTableError
        ? { message: error.code, code: error.code, params: error.params }
        : error instanceof SqlError
          ? { message: error.message, line: error.line, results: error.results }
          : { message: String((error as Error)?.message ?? error) },
    }
  }
  self.postMessage(response)
}
