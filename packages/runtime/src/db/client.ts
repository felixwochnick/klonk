import type { WorldData } from '@klonk/world'
import { SqlError, type SqlEngineName, type SqlResult, type SqlTable, type SqlValue } from './types'
import type { WorldSqlLanguage } from './world'

type Op
  = | { op: 'open', engine: SqlEngineName, initial?: string | Uint8Array, world?: { data: WorldData, lang: WorldSqlLanguage } }
    | { op: 'script', handle: number, sql: string, maxRows?: number }
    | { op: 'query', handle: number, sql: string, params?: SqlValue[], maxRows?: number }
    | { op: 'dump' | 'tables' | 'export' | 'close', handle: number }
    | { op: 'readWorld', handle: number, previous: WorldData, lang: WorldSqlLanguage }

export type DbWorkerRequest = Op & { id: number }
export type DbWorkerError = { message: string, line?: number | null, results?: SqlResult[], code?: string, params?: Record<string, string | number> }
export type DbWorkerResponse = { id: number, ok: true, value: unknown } | { id: number, ok: false, error: DbWorkerError }

/** Fehler beim Übertragen von Welt-Tabellen (Code ⇒ Übersetzung) */
export class WorldSqlError extends Error {
  constructor(public readonly code: string, public readonly params: Record<string, string | number>) {
    super(code)
  }
}

/** Hauptthread: Datenbanken im eigenen Worker (`@klonk/runtime/db-worker?worker`), Antworten als Promises */
export class DatabaseClient {
  private worker?: Worker
  private pending = new Map<number, { resolve: (value: unknown) => void, reject: (error: Error) => void }>()
  private nextId = 1

  constructor(private createWorker: () => Worker) {}

  call<T>(op: Op, transfer: Transferable[] = []): Promise<T> {
    if (!this.worker) {
      this.worker = this.createWorker()
      this.worker.onmessage = (event: MessageEvent<DbWorkerResponse>) => {
        const response = event.data
        const waiting = this.pending.get(response.id)
        this.pending.delete(response.id)
        if (!waiting) return
        if (response.ok) waiting.resolve(response.value)
        else if (response.error.code) waiting.reject(new WorldSqlError(response.error.code, response.error.params ?? {}))
        else waiting.reject(new SqlError(response.error.message, response.error.line ?? null, response.error.results ?? []))
      }
    }
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      this.worker!.postMessage({ ...op, id }, transfer)
    })
  }

  async open(engine: SqlEngineName, initial?: string | Uint8Array) {
    return new DatabaseSession(this, engine, await this.call<number>({ op: 'open', engine, initial }))
  }

  /** Welt als Datenbank (Tabellen in der Sprache der Oberfläche) */
  async openWorld(engine: SqlEngineName, data: WorldData, lang: WorldSqlLanguage) {
    return new DatabaseSession(this, engine, await this.call<number>({ op: 'open', engine, world: { data, lang } }))
  }

  dispose() {
    this.worker?.terminate()
    this.worker = undefined
    for (const waiting of this.pending.values()) waiting.reject(new SqlError('closed'))
    this.pending.clear()
  }
}

export class DatabaseSession {
  constructor(private client: DatabaseClient, readonly engine: SqlEngineName, readonly handle: number) {}

  script(sql: string, maxRows?: number) {
    return this.client.call<SqlResult[]>({ op: 'script', handle: this.handle, sql, maxRows })
  }

  query(sql: string, params?: SqlValue[], maxRows?: number) {
    return this.client.call<SqlResult>({ op: 'query', handle: this.handle, sql, params, maxRows })
  }

  dump() {
    return this.client.call<string>({ op: 'dump', handle: this.handle })
  }

  tables() {
    return this.client.call<SqlTable[]>({ op: 'tables', handle: this.handle })
  }

  exportFile() {
    return this.client.call<Uint8Array>({ op: 'export', handle: this.handle })
  }

  readWorld(previous: WorldData, lang: WorldSqlLanguage) {
    return this.client.call<WorldData>({ op: 'readWorld', handle: this.handle, previous, lang })
  }

  close() {
    return this.client.call<null>({ op: 'close', handle: this.handle })
  }
}
