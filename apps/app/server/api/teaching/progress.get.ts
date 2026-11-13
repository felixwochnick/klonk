import { z } from 'zod'

// Lernstand der geleiteten Gruppen einer Jahrgangsstufe (`all` = alle, z. B. ohne Schulform), je freigegebenem Modul zusammengefasst
const querySchema = z.object({ level: z.string().regex(/^(\d{1,2}|courses|none|all)$/) })

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const { level } = await getValidatedQuery(event, querySchema.parse)
  return teachingProgress(user, level)
})
