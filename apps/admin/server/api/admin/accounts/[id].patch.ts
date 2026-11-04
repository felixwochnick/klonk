import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'

/**
 * Privatkonto bearbeiten: sperren/freigeben (Betreiber:innen) und Betreiberrolle vergeben (nur Besitzer:innen).
 * So werden auch Google-/Microsoft-Konten zu Betreiber:innen. Klonk-ID-Konten folgen ihren Gruppen.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { platformAdmin: true })
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.uuid() }).parse)
  const input = await readValidated(event, z.object({
    platformRole: z.enum(['user', 'developer', 'owner']).optional(),
    disabled: z.boolean().optional(),
  }))

  if (id === user.id) throw createError({ statusCode: 400, message: 'cannot_change_self' })
  if (input.platformRole && user.platformRole !== 'owner')
    throw createError({ statusCode: 403, message: 'owner_only' })

  const { users, accounts } = schema
  await withUserDb(user.id, async (tx) => {
    const [target] = await tx.select({ id: users.id, platformRole: users.platformRole }).from(users)
      .where(and(eq(users.id, id), isNull(users.organizationId)))
    if (!target) throw createError({ statusCode: 404, message: 'not_found' })
    // Besitzer:innen sperren nur Besitzer:innen
    if (target.platformRole === 'owner' && user.platformRole !== 'owner')
      throw createError({ statusCode: 403, message: 'owner_only' })

    if (input.platformRole) {
      const [platform] = await tx.select({ id: accounts.id }).from(accounts)
        .where(and(eq(accounts.userId, id), eq(accounts.provider, 'platform')))
      if (platform) throw createError({ statusCode: 409, message: 'role_from_groups' })
    }

    await tx.update(users).set(input).where(eq(users.id, id))
  })

  if (input.disabled || input.platformRole) await revokeUserSessions(id)
  return { ok: true }
})
