import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../database/schema'

export function createDb(databaseUrl: string) {
  return drizzle(postgres(databaseUrl), { schema, casing: 'snake_case' })
}

export type Db = ReturnType<typeof createDb>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

let _db: Db | undefined

/**
 * Systemzugriff ohne RLS – nur für Anmeldung, Sessions und Einrichtung verwenden.
 * Alles, was im Namen eines Nutzers passiert, läuft über {@link withUserDb}.
 */
export function useSystemDb() {
  if (!_db) {
    const { databaseUrl } = useRuntimeConfig()
    if (!databaseUrl) throw new Error('NUXT_DATABASE_URL ist nicht gesetzt')
    _db = createDb(databaseUrl)
  }
  return _db
}

/** Führt `fn` in einer Transaktion mit der RLS-Rolle `klonk_user` im Kontext des Nutzers aus */
export function runAsUser<T>(db: Db, userId: string, fn: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('klonk.user_id', ${userId}, true)`)
    await tx.execute(sql`set local role klonk_user`)
    return fn(tx)
  })
}

export function withUserDb<T>(userId: string, fn: (tx: Tx) => Promise<T>) {
  return runAsUser(useSystemDb(), userId, fn)
}

export { schema }
