import { eq } from 'drizzle-orm'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { roles: ['admin'] })
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.uuid() }).parse)
  const input = await readValidated(event, z.object({
    displayName: z.string().trim().min(1).max(200).optional(),
    role: roleSchema.optional(),
    disabled: z.boolean().optional(),
  }))

  if (id === user.id && (input.role || input.disabled))
    throw createError({ statusCode: 400, message: 'cannot_change_self' })

  const rows = await withUserDb(user.id, tx => tx.update(schema.users).set(input)
    .where(eq(schema.users.id, id)).returning({ id: schema.users.id }))
  if (!rows.length) throw createError({ statusCode: 404, message: 'not_found' })

  if (input.disabled) await revokeUserSessions(id)
  return { ok: true }
})
