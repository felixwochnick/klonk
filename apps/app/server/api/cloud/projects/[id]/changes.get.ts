import { z } from 'zod'

// Änderungen seit einer Revision (Synchronisieren) – auch ohne Abo lesbar
export default defineEventHandler(async (event): Promise<CloudChanges> => {
  const { user } = await requireAuth(event)
  const { since } = await getValidatedQuery(event, z.object({ since: z.coerce.number().int().min(0).default(0) }).parse)
  return cloudChanges(user, event, getRouterParam(event, 'id')!, since)
})
