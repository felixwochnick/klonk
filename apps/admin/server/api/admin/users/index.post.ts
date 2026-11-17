// Lokales Konto anlegen (Admins)
export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)
  return createUser(user, organizationId, await readValidated(event, userCreateSchema), event)
})
