// Anmeldestatus für andere Seiten derselben Domain (z. B. die Website klonk.* aus dem privaten Repo).
// Aufruf per fetch(…, { credentials: 'include' }); nur Origins aus NUXT_PUBLIC_WEBSITE_URLS (+ app/admin) erhalten CORS.
export default defineEventHandler(async (event) => {
  const origin = getRequestHeader(event, 'origin')
  if (origin && safeRedirectTarget(origin, allowedRedirectOrigins(useRuntimeConfig().public), '') !== '') {
    setResponseHeaders(event, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin',
    })
  }

  // Die Session-Middleware hat ungültige Sessions bereits entfernt
  const { user } = await getUserSession(event)
  if (!user) return { user: null }

  return {
    user: {
      id: user.id,
      displayName: user.displayName,
      organizationName: user.organizationName,
      role: user.role,
      platformRole: user.platformRole,
    },
  }
})
