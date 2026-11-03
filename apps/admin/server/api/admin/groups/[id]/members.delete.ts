import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

// Mitglied entfernen
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { roles: ['teacher', 'admin'] })
  const groupId = getRouterParam(event, 'id')!
  const { userId } = await readValidated(event, z.object({ userId: z.uuid() }))
  const table = schema.groupMembers
  const deleted = await withUserDb(user.id, tx => tx.delete(table)
    .where(and(eq(table.groupId, groupId), eq(table.userId, userId))).returning({ userId: table.userId }))
  if (!deleted.length) throw createError({ statusCode: 403, message: 'group_forbidden' })
  return { ok: true }
})
