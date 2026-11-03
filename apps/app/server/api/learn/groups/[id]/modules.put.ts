import { z } from 'zod'

// Module für eine Gruppe freigeben (Gruppenleitung)
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  await requireCloud(user, event)
  const { modules } = await readValidated(event, z.object({ modules: z.array(z.string().max(64)).max(100) }))
  return setGroupLearnModules(user, getRouterParam(event, 'id')!, modules)
})
