import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '../../database/schema'

// Eigenes Passwort ändern (auch nach Reset durch Lehrkraft/Admin erzwungen)
export default defineEventHandler(async (event) => {
  const { user, sessionId } = await requireAuth(event)
  const { currentPassword, newPassword } = await readValidated(event, z.object({
    currentPassword: z.string().max(1000).optional(),
    newPassword: z.string().min(8).max(1000),
  }))

  const passwordHash = await withUserDb(user.id, async (tx) => {
    const [row] = await tx.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id))
    return row?.passwordHash ?? null
  })

  // SSO-Konten (LDAP/OIDC/OAuth) haben kein lokales Passwort
  if (!passwordHash) throw createError({ statusCode: 400, message: 'no_local_password' })

  // Nach einem Reset kennt der Nutzer nur das temporäre Passwort – das muss trotzdem angegeben werden
  if (!(currentPassword && await verifyPassword(passwordHash, currentPassword)))
    throw createError({ statusCode: 400, message: 'invalid_current_password' })

  const newHash = await hashPassword(newPassword)
  await withUserDb(user.id, tx => tx.update(users).set({
    passwordHash: newHash,
    mustChangePassword: false,
  }).where(eq(users.id, user.id)))

  await revokeUserSessions(user.id, sessionId)
  const sessionUser = await loadSessionUser(user.id)
  await replaceUserSession(event, { user: sessionUser!, sessionId })
  return { user: sessionUser }
})
