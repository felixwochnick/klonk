import { z } from 'zod'

const path = z.string().refine(isValidCloudPath, 'cloud_invalid_path')

// Eigenes Cloud-Projekt anlegen – leer oder mit Inhalt (lokales Projekt hochladen)
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  await requireCloud(user, event)
  const input = await readValidated(event, z.object({
    name: z.string().trim().min(1).max(120).refine(name => isValidCloudPath(name) && !name.includes('/'), 'invalid_name'),
    files: z.array(z.object({ path, content: z.string() })).max(CLOUD_LIMITS.files).default([]),
    folders: z.array(path).max(CLOUD_LIMITS.files).default([]),
  }))
  const project = await withUserDb(user.id, tx => createCloudProject(tx, user, input))
  return { id: project.id, name: project.name }
})
