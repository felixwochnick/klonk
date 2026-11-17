// Zustimmungsseite: Anfrage prüfen und anzeigen, welches Programm welchen Zugang möchte
export default defineEventHandler(async (event) => {
  if (!isMcpAuthorizationServer()) throw createError({ statusCode: 404, message: 'not_found' })
  const { user } = await requireAuth(event)
  const { client, params, requested, resource } = await checkAuthorizeRequest(getQuery(event))
  const redirect = new URL(params.redirect_uri)
  return {
    client: { name: client.name, redirect: redirect.protocol.startsWith('http') ? redirect.host : redirect.protocol.slice(0, -1) },
    requested,
    resource,
    max: await accountMcpAccess(user.id),
  }
})
