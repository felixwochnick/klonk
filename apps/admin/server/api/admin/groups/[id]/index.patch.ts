import { eq } from 'drizzle-orm'
import { z } from 'zod'

// Name, Einordnung (Jahrgangsstufe/Zusatzkurse) und Schreibrecht im gemeinsamen Ordner (Gruppenleitung oder Admin)
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { roles: ['teacher', 'admin'] })
  const id = getRouterParam(event, 'id')!
  const input = await readValidated(event, z.object({
    name: groupNameSchema.optional(),
    membersCanWrite: z.boolean().optional(),
    level: groupLevelSchema.optional(),
  }))
  return withUserDb(user.id, async (tx) => {
    const [group] = await tx.update(schema.groups).set(input).where(eq(schema.groups.id, id)).returning({ id: schema.groups.id })
      .catch(error => rethrowUnique(error, 'group_exists'))
    if (!group) throw createError({ statusCode: 403, message: 'group_forbidden' })
    if (input.name) await tx.update(schema.cloudProjects).set({ name: input.name }).where(eq(schema.cloudProjects.groupId, id))
    return { ok: true }
  })
})
