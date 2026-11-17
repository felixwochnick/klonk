// RFC 9728: `/.well-known/oauth-protected-resource[/mcp]` – nur in Apps mit MCP-Server (appConfig `klonk.mcp`)
export default defineEventHandler((event) => {
  if (mcpCors(event)) return null
  if (!useAppConfig().klonk?.mcp) throw createError({ statusCode: 404, message: 'not_found' })
  return protectedResourceMetadata(event)
})
