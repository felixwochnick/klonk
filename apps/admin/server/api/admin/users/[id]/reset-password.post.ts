import { eq } from 'drizzle-orm'
import { z } from 'zod'

// Lehrkräfte (für Lernende) und Admins vergeben ein temporäres Passwort – RLS prüft, wer wen ändern darf
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { roles: ['teacher', 'admin'] })
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.uuid() }).parse)
  const { password } = await readValidated(event, z.object({ password: passwordSchema }))

  if (id === user.id) throw createError({ statusCode: 400, message: 'cannot_change_self' })

  const passwordHash = await hashPassword(password)
  const rows = await withUserDb(user.id, tx => tx.update(schema.users)
    .set({ passwordHash, mustChangePassword: true })
    .where(eq(schema.users.id, id))
    .returning({ id: schema.users.id }))
  if (!rows.length) throw createError({ statusCode: 404, message: 'not_found' })

  await revokeUserSessions(id)
  return { ok: true }
})
