import { eq } from 'drizzle-orm'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)
  const input = await readValidated(event, z.object({
    name: z.string().trim().min(2).max(200).optional(),
    type: z.enum(['school', 'company']).optional(),
    domain: domainSchema.optional(),
    /** Erlaubte Speicherorte für Lernmodule */
    learnStorage: z.array(z.enum(['cloud', 'browser', 'folder'])).min(1).max(3).optional(),
  }))

  const rows = await withUserDb(user.id, tx => tx.update(schema.organizations).set(input)
    .where(eq(schema.organizations.id, organizationId)).returning())
    .catch(e => rethrowUnique(e, 'domain_taken'))
  if (!rows.length) throw createError({ statusCode: 404, message: 'not_found' })
  return rows[0]
})
