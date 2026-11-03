import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

// Eigenes Cloud-Projekt umbenennen
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  await requireCloud(user, event)
  const id = getRouterParam(event, 'id')!
  const { name } = await readValidated(event, z.object({
    name: z.string().trim().min(1).max(120).refine(name => isValidCloudPath(name) && !name.includes('/'), 'invalid_name'),
  }))
  const table = schema.cloudProjects
  return withUserDb(user.id, async (tx) => {
    const [taken] = await tx.select({ id: table.id }).from(table).where(and(eq(table.ownerId, user.id), eq(table.name, name)))
    if (taken && taken.id !== id) throw createError({ statusCode: 409, message: 'cloud_exists' })
    const [project] = await tx.update(table).set({ name, updatedAt: new Date() })
      .where(and(eq(table.id, id), eq(table.ownerId, user.id))).returning({ id: table.id })
    if (!project) throw createError({ statusCode: 404, message: 'cloud_not_found' })
    return { ok: true }
  })
})
