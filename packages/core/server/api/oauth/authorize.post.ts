import { z } from 'zod'
// Ausdrücklich: vor `as` erkennt der Auto-Import Bezeichner nicht
import { MCP_GRANTS, type McpGrant } from '../../../shared/utils/mcp'

// Zustimmen (Code ausstellen) oder ablehnen – liefert die Rücksprung-Adresse des Programms
export default defineEventHandler(async (event) => {
  if (!isMcpAuthorizationServer()) throw createError({ statusCode: 404, message: 'not_found' })
  const { user } = await requireAuth(event)
  const { query, approve, access } = await readValidated(event, z.object({
    query: z.record(z.string(), z.string()),
    approve: z.boolean(),
    access: z.enum(MCP_GRANTS as [McpGrant, ...McpGrant[]]).optional(),
  }))
  if (!approve) return { redirect: await denyAuthorization(event, query) }
  if (!access) throw createError({ statusCode: 400, message: 'invalid_input' })
  return { redirect: await approveAuthorization(event, user, query, access) }
})
