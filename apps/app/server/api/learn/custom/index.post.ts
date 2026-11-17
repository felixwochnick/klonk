import { z } from 'zod'

// Eigenes Lernmodul anlegen (Lehrkräfte und Admins einer Organisation) – Daten prüft `createCustomModule`
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const { data } = await readValidated(event, z.object({ data: z.unknown() }))
  return createCustomModule(user, data)
})
