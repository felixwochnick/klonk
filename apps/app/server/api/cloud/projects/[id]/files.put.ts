import { z } from 'zod'

// Datei/Ordner schreiben oder löschen; bei gleichzeitiger Änderung 409 mit dem Stand des Servers
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  await requireCloud(user, event)
  const input = await readValidated(event, z.object({
    path: z.string().refine(isValidCloudPath, 'cloud_invalid_path'),
    folder: z.boolean().default(false),
    deleted: z.boolean().default(false),
    content: z.string().max(CLOUD_LIMITS.fileBytes * 2).nullable().default(null),
    baseRevision: z.number().int().min(0),
  }))
  try {
    return await writeCloudEntry(user, getRouterParam(event, 'id')!, input)
  }
  catch (error) {
    if (error instanceof CloudConflict) {
      setResponseStatus(event, 409)
      return { conflict: error.current }
    }
    throw error
  }
})
