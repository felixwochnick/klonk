import { z } from 'zod'

// Anzeigename, Rolle, Sperre und KI-Zugriff (MCP) eines Kontos (Admins)
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { roles: ['admin'] })
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.uuid() }).parse)
  return updateUser(user, id, await readValidated(event, userUpdateSchema))
})
