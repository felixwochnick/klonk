import { z } from 'zod'

// Mitglieder hinzufügen bzw. Rolle ändern (nur Konten der Organisation – RLS prüft)
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { roles: ['teacher', 'admin'] })
  const groupId = getRouterParam(event, 'id')!
  const { userIds, role } = await readValidated(event, z.object({
    userIds: z.array(z.uuid()).min(1).max(500),
    role: z.enum(['leader', 'member']),
  }))
  const table = schema.groupMembers
  await withUserDb(user.id, tx => tx.insert(table).values(userIds.map(userId => ({ groupId, userId, role })))
    .onConflictDoUpdate({ target: [table.groupId, table.userId], set: { role } }))
    .catch(() => {
      throw createError({ statusCode: 403, message: 'group_forbidden' })
    })
  return { ok: true }
})
