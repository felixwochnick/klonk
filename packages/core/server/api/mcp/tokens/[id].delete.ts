import { z } from 'zod'

// Token bzw. verbundenen KI-Assistenten widerrufen
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.uuid() }).parse)
  return revokeMcpToken(user, id)
})
