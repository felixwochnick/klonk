// Kontenstand gegenüber der Lizenzgrenze (für Hinweise in der Kontenverwaltung)
export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['teacher', 'admin'] })
  const instance = await getInstanceLicense()
  if (!hasFeature(instance, 'hosted')) return getUserUsage(null)
  return getUserUsage(await resolveOrganizationId(event, user, isPlatformAdmin))
})
