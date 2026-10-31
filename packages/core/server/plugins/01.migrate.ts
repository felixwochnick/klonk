import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

// Beliebige, aber feste ID – verhindert parallele Migrationen mehrerer Instanzen
const MIGRATION_LOCK_ID = 4_206_942

/**
 * Prüft beim Serverstart, ob das DB-Schema aktuell ist, und spielt fehlende Migrationen ein.
 * Schlägt die Migration fehl, wird der Start abgebrochen.
 */
export default defineNitroPlugin(async () => {
  const { databaseUrl, migrationsDir } = useRuntimeConfig()
  if (!databaseUrl) throw new Error('NUXT_DATABASE_URL ist nicht gesetzt')

  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} })
  try {
    await client`select pg_advisory_lock(${MIGRATION_LOCK_ID})`
    await migrate(drizzle(client), { migrationsFolder: migrationsDir })
    console.info('[klonk] Datenbankschema ist aktuell')
  }
  catch (error) {
    console.error('[klonk] Datenbankmigration fehlgeschlagen', error)
    if (import.meta.dev) throw error
    process.exit(1)
  }
  finally {
    await client`select pg_advisory_unlock(${MIGRATION_LOCK_ID})`.catch(() => {})
    await client.end()
  }
})
