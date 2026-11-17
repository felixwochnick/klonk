import { z } from 'zod'

// Mitglieder hinzufügen bzw. Rolle ändern (nur Konten der Organisation – RLS prüft)
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { roles: ['teacher', 'admin'] })
  const { userIds, role } = await readValidated(event, z.object({
    userIds: z.array(z.uuid()).min(1).max(500),
    role: z.enum(['leader', 'member']),
  }))
  return addGroupMembers(user, getRouterParam(event, 'id')!, userIds, role)
})
