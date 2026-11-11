import { LEARN_STORAGES, type LearnStorage } from '@klonk/learn'
import { z } from 'zod'

// Module für eine Gruppe freigeben, je Modul mit Sprachvorgabe, dazu die Speicherorte der Gruppe (Gruppenleitung).
// Ohne Klonk Cloud möglich: Lernende speichern dann im Browser bzw. in einem Ordner.
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const { modules, storage } = await readValidated(event, z.object({
    modules: z.array(z.object({ id: z.string().max(64), languages: z.enum(['both', 'blocks', 'klonk']).default('both') })).max(100),
    storage: z.array(z.enum(LEARN_STORAGES as [string, ...string[]])).min(1).max(3).nullable().optional(),
  }))
  return setGroupLearnModules(user, getRouterParam(event, 'id')!, modules, storage as LearnStorage[] | null | undefined)
})
