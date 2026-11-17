// RFC 7591: MCP-Programme (Claude, ChatGPT, VS Code …) melden sich selbst an
export default defineEventHandler(async (event) => {
  if (mcpCors(event)) return null
  if (!isMcpAuthorizationServer()) throw createError({ statusCode: 404, message: 'not_found' })
  if (event.method !== 'POST') throw createError({ statusCode: 405, message: 'method_not_allowed' })
  return oauthEndpoint(event, async () => registerOAuthClient(await readBody(event).catch(() => null)), 201)
})
