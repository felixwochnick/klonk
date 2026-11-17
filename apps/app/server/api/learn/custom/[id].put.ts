import { z } from 'zod'

// Eigenes Lernmodul speichern (Autor:in, Admins); `base` = Stand beim Laden ⇒ Konflikt statt Überschreiben
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const { data, base } = await readValidated(event, z.object({ data: z.unknown(), base: z.string().max(40).optional() }))
  return updateCustomModule(user, getRouterParam(event, 'id')!, data, base)
})
