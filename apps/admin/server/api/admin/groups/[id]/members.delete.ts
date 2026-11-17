import { z } from 'zod'

// Mitglied entfernen
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { roles: ['teacher', 'admin'] })
  const { userId } = await readValidated(event, z.object({ userId: z.uuid() }))
  return removeGroupMember(user, getRouterParam(event, 'id')!, userId)
})
