import { z } from 'zod'

// Module für eine Gruppe freigeben, je Modul mit Sprachvorgabe (Gruppenleitung)
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  await requireCloud(user, event)
  const { modules } = await readValidated(event, z.object({
    modules: z.array(z.object({ id: z.string().max(64), languages: z.enum(['both', 'blocks', 'klonk']).default('both') })).max(100),
  }))
  return setGroupLearnModules(user, getRouterParam(event, 'id')!, modules)
})
