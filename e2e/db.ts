import postgres from 'postgres'

// E2E-Tests laufen gegen eine eigene Datenbank, damit die Entwicklungsdaten unberührt bleiben
export const baseDatabaseUrl = process.env.KLONK_TEST_DATABASE_URL ?? 'postgres://klonk:klonk@localhost:5432/klonk'
export const e2eDatabaseUrl = baseDatabaseUrl.replace(/\/[^/]+$/, '/klonk_e2e')

export async function ensureDatabase() {
  const sql = postgres(baseDatabaseUrl, { max: 1, onnotice: () => {} })
  try {
    const [row] = await sql`select 1 from pg_database where datname = 'klonk_e2e'`
    if (!row) await sql.unsafe('create database klonk_e2e').catch(() => {})
  }
  finally {
    await sql.end()
  }
}

export const RESET_SQL = 'truncate organizations, users, sessions, accounts, organization_auth_settings, instance_settings cascade'

export async function resetData() {
  const sql = postgres(e2eDatabaseUrl, { max: 1, onnotice: () => {} })
  try {
    await sql.unsafe(RESET_SQL)
  }
  finally {
    await sql.end()
  }
}
