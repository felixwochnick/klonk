import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { organizationAuthSettings, organizations, users } from '../../database/schema'

const setupSchema = z.object({
  organizationType: z.enum(['school', 'company']),
  organizationName: z.string().trim().min(2).max(200),
  domain: z.string().trim().toLowerCase().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{2,64}$/),
  displayName: z.string().trim().min(2).max(200),
  password: z.string().min(8).max(1000),
})

// Ersteinrichtung: erste Organisation + Admin, der zugleich Besitzer der Instanz ist
export default defineEventHandler(async (event) => {
  const input = await readValidated(event, setupSchema)
  const passwordHash = await hashPassword(input.password)

  const user = await useSystemDb().transaction(async (tx) => {
    // Sperre verhindert, dass zwei gleichzeitige Anfragen beide einrichten
    await tx.execute(sql`select pg_advisory_xact_lock(4206943)`)
    if (await isSetupDone()) throw createError({ statusCode: 409, message: 'setup_done' })

    const [org] = await tx.insert(organizations).values({
      type: input.organizationType,
      name: input.organizationName,
      domain: input.domain,
    }).returning()
    await tx.insert(organizationAuthSettings).values({ organizationId: org!.id })

    const [admin] = await tx.insert(users).values({
      organizationId: org!.id,
      username: input.username,
      displayName: input.displayName,
      role: 'admin',
      platformRole: 'owner',
      passwordHash,
    }).returning()
    return admin!
  })

  return { user: await startUserSession(event, user) }
})
