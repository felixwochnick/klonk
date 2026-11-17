import postgres from 'postgres'

// E2E-Tests laufen gegen eine eigene Datenbank, damit die Entwicklungsdaten unberührt bleiben
export const baseDatabaseUrl = process.env.KLONK_TEST_DATABASE_URL ?? 'postgres://klonk:klonk@localhost:5432/klonk'
/** Eigener Name (`KLONK_E2E_DATABASE`) für parallele Läufe in mehreren Arbeitskopien, siehe e2e/targets.ts */
export const E2E_DATABASE = process.env.KLONK_E2E_DATABASE ?? 'klonk_e2e'
export const e2eDatabaseUrl = baseDatabaseUrl.replace(/\/[^/]+$/, `/${E2E_DATABASE}`)

export async function ensureDatabase() {
  const sql = postgres(baseDatabaseUrl, { max: 1, onnotice: () => {} })
  try {
    if (!/^[a-z0-9_]+$/.test(E2E_DATABASE)) throw new Error(`Ungültiger Datenbankname: ${E2E_DATABASE}`)
    const [row] = await sql`select 1 from pg_database where datname = ${E2E_DATABASE}`
    if (!row) await sql.unsafe(`create database ${E2E_DATABASE}`).catch(() => {})
  }
  finally {
    await sql.end()
  }
}

export const RESET_SQL = 'truncate organizations, users, sessions, accounts, organization_auth_settings, organization_ai_settings, ai_usage, ai_credit_grants, groups, cloud_projects, instance_settings, mcp_oauth_clients cascade'

export async function resetData() {
  const sql = postgres(e2eDatabaseUrl, { max: 1, onnotice: () => {} })
  try {
    await sql.unsafe(RESET_SQL)
  }
  finally {
    await sql.end()
  }
}
