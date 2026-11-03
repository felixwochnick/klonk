import { and, eq } from 'drizzle-orm'

// Eigenes Cloud-Projekt löschen (gemeinsame Ordner verschwinden mit ihrer Gruppe)
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const table = schema.cloudProjects
  const deleted = await withUserDb(user.id, tx => tx.delete(table)
    .where(and(eq(table.id, id), eq(table.ownerId, user.id))).returning({ id: table.id }))
  if (!deleted.length) throw createError({ statusCode: 404, message: 'cloud_not_found' })
  return { ok: true }
})
