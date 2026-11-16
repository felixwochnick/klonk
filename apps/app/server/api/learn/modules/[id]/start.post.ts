import { ALL_LEARN_LANGUAGES, type LearnLanguage } from '@klonk/learn'
import { z } from 'zod'

// Modul starten: eigenes Cloud-Projekt anlegen bzw. das begonnene liefern (nur mit Klonk Cloud)
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  await requireCloud(user, event)
  const { lang, language } = await readValidated(event, z.object({
    lang: z.enum(['de', 'en']).default('de'),
    // Sprache der Programme (Reihen F und A: zuletzt gewählte Programmiersprache)
    language: z.enum(ALL_LEARN_LANGUAGES as [LearnLanguage, ...LearnLanguage[]]).optional(),
  }))
  const project = await startLearnModule(user, getRouterParam(event, 'id')!, lang, language)
  return { id: project.id, name: project.name }
})
