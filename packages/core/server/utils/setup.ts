import { count } from 'drizzle-orm'
import { users } from '../database/schema'

/** Die Instanz ist eingerichtet, sobald es mindestens ein Konto gibt */
export async function isSetupDone() {
  const [row] = await useSystemDb().select({ n: count() }).from(users)
  return (row?.n ?? 0) > 0
}
