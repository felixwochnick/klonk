import { eq } from 'drizzle-orm'
import { z } from 'zod'

// Lizenz-Token der eigenen Organisation (gehostete Plattform, Abo von Schule/Unternehmen)
export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)
  const { token } = await readValidated(event, z.object({ token: z.string().trim().max(10_000).nullable() }))

  if (!hasFeature(await getInstanceLicense(), 'hosted'))
    throw createError({ statusCode: 409, message: 'license_instance_only' })
  if (token) await assertValidToken(token)

  await withUserDb(user.id, tx => tx.update(schema.organizations).set({ licenseToken: token })
    .where(eq(schema.organizations.id, organizationId)))

  return getOrganizationLicense(organizationId)
})
