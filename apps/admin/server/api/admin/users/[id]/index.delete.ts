import { eq } from 'drizzle-orm'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { roles: ['admin'] })
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.uuid() }).parse)

  const rows = await withUserDb(user.id, tx => tx.delete(schema.users)
    .where(eq(schema.users.id, id)).returning({ id: schema.users.id }))
  if (!rows.length) throw createError({ statusCode: 404, message: 'not_found' })
  return { ok: true }
})
