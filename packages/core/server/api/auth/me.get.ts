// Frische Nutzerdaten aus der DB in die Session übernehmen (z. B. nach Rollenänderung)
export default defineEventHandler(async (event) => {
  const { user, sessionId } = await requireAuth(event)
  const fresh = await loadSessionUser(user.id)
  if (!fresh) {
    await endUserSession(event)
    throw createError({ statusCode: 401, message: 'unauthorized' })
  }
  await replaceUserSession(event, { user: fresh, sessionId })
  return { user: fresh }
})
