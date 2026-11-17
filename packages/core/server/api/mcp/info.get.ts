// Einstellungen → KI-Assistenten (MCP): Stufe des Kontos und Adressen der MCP-Server
export default defineEventHandler(async (event): Promise<McpInfo> => {
  const { user } = await requireAuth(event)
  return { access: await accountMcpAccess(user.id), servers: mcpServers() }
})
