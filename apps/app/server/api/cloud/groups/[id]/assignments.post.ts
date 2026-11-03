import { z } from 'zod'

// Ordner im gemeinsamen Ordner zur Aufgabe machen (Gruppenleitung; RLS prüft)
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  await requireCloud(user, event)
  const groupId = getRouterParam(event, 'id')!
  const { path } = await readValidated(event, z.object({ path: z.string().refine(isValidCloudPath, 'cloud_invalid_path') }))
  const table = schema.cloudAssignments
  const [assignment] = await withUserDb(user.id, tx => tx.insert(table).values({ groupId, path, createdBy: user.id })
    .onConflictDoNothing().returning({ id: table.id })).catch(() => {
    throw createError({ statusCode: 403, message: 'cloud_read_only' })
  })
  return { id: assignment?.id ?? null }
})
