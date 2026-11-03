import { z } from 'zod'

// Modul starten: eigenes Cloud-Projekt anlegen bzw. das begonnene liefern (nur mit Klonk Cloud)
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  await requireCloud(user, event)
  const { lang } = await readValidated(event, z.object({ lang: z.enum(['de', 'en']).default('de') }))
  const project = await startLearnModule(user, getRouterParam(event, 'id')!, lang)
  return { id: project.id, name: project.name }
})
