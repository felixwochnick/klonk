import { eq } from 'drizzle-orm'

// Aufgabe aufheben (Ordner und begonnene Bearbeitungen bleiben)
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const table = schema.cloudAssignments
  const deleted = await withUserDb(user.id, tx => tx.delete(table).where(eq(table.id, getRouterParam(event, 'id')!)).returning({ id: table.id }))
  if (!deleted.length) throw createError({ statusCode: 404, message: 'cloud_not_found' })
  return { ok: true }
})
