import { z } from 'zod'

// Eigenes Lernmodul anlegen (Lehrkräfte und Admins einer Organisation, Lizenz-Feature `customModules`) – Daten prüft `createCustomModule`
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const { data } = await readValidated(event, z.object({ data: z.unknown() }))
  return createCustomModule(user, data, event)
})
