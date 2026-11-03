import { eq } from 'drizzle-orm'

// Gruppe samt gemeinsamem Ordner löschen (Bearbeitungen der Mitglieder bleiben in deren Cloud)
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { roles: ['teacher', 'admin'] })
  const deleted = await withUserDb(user.id, tx => tx.delete(schema.groups)
    .where(eq(schema.groups.id, getRouterParam(event, 'id')!)).returning({ id: schema.groups.id }))
  if (!deleted.length) throw createError({ statusCode: 403, message: 'group_forbidden' })
  return { ok: true }
})
