import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['teacher', 'admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)

  const [org] = await withUserDb(user.id, tx => tx.select().from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId)))
  if (!org) throw createError({ statusCode: 404, message: 'not_found' })
  return org
})
