const ALLOWED_DURING_PASSWORD_CHANGE = ['/api/auth/', '/api/_auth/', '/api/setup', '/api/health']

// Prüft Cookie-Sessions gegen die DB, damit Logout, Passwort-Reset und Sperren sofort wirken
export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/') && !event.path.startsWith('/auth/')) return

  const session = await getUserSession(event)
  if (!session.user) return

  if (!session.sessionId || !(await isSessionValid(session.sessionId, session.user.id))) {
    await clearUserSession(event)
    return
  }

  // Muss das Passwort geändert werden, ist nur die Auth-API erlaubt
  if (session.user.mustChangePassword && event.path.startsWith('/api/') && !ALLOWED_DURING_PASSWORD_CHANGE.some(p => event.path.startsWith(p)))
    throw createError({ statusCode: 403, message: 'password_change_required' })
})
