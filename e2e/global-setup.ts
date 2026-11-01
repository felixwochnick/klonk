import { execFileSync } from 'node:child_process'
import { resetData, RESET_SQL } from './db'
import { STACK } from './targets'

export default async function globalSetup() {
  if (!STACK) return resetData()
  // Lokaler Stack: Datenbank im Container leeren
  execFileSync('docker', ['exec', 'klonk-local-postgres-1', 'psql', '-U', 'klonk', '-d', 'klonk', '-c', RESET_SQL], { stdio: 'ignore' })
}
