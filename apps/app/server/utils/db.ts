import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../database/schema'

let _db: ReturnType<typeof createDb> | undefined

function createDb() {
  const { databaseUrl } = useRuntimeConfig()
  if (!databaseUrl) throw new Error('NUXT_DATABASE_URL ist nicht gesetzt')
  return drizzle(postgres(databaseUrl), { schema, casing: 'snake_case' })
}

export function useDb() {
  return (_db ??= createDb())
}

export { schema }
