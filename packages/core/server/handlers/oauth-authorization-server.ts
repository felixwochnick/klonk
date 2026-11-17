// RFC 8414: Metadaten des Autorisierungsservers für MCP-Clients (zentrale Anmeldung bzw. ohne sie jede App selbst)
export default defineEventHandler((event) => {
  if (mcpCors(event)) return null
  if (!isMcpAuthorizationServer()) throw createError({ statusCode: 404, message: 'not_found' })
  return authorizationServerMetadata(event)
})
