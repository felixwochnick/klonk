import { z } from 'zod'
// Ausdrücklich: vor `as` erkennt der Auto-Import Bezeichner nicht
import { MCP_GRANTS, MCP_TOKEN_DAYS, type McpGrant } from '../../../../shared/utils/mcp'

// Persönliches Token anlegen (z. B. für Claude Code oder Cursor) – der Klartext kommt nur in dieser Antwort
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const input = await readValidated(event, z.object({
    name: z.string().trim().min(1).max(100),
    access: z.enum(MCP_GRANTS as [McpGrant, ...McpGrant[]]),
    days: z.number().int().refine(d => (MCP_TOKEN_DAYS as readonly number[]).includes(d)),
  }))
  if (!mcpAllows(await accountMcpAccess(user.id), input.access)) throw createError({ statusCode: 403, message: 'mcp_access_forbidden' })
  return createPersonalToken(user, input)
})
