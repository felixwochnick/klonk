// OAuth-Token-Endpunkt: Autorisierungscode (PKCE) bzw. Refresh-Token gegen neue Tokens
export default defineEventHandler(async (event) => {
  if (mcpCors(event)) return null
  if (!isMcpAuthorizationServer()) throw createError({ statusCode: 404, message: 'not_found' })
  if (event.method !== 'POST') throw createError({ statusCode: 405, message: 'method_not_allowed' })
  return oauthEndpoint(event, () => exchangeOAuthToken(event))
})
