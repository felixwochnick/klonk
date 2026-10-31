import { sql } from 'drizzle-orm'

export default defineEventHandler(async () => {
  await useSystemDb().execute(sql`select 1`)
  return { status: 'ok' }
})
