// Gruppen der Organisation (Lehrkräfte und Admins sehen alle, verwalten Leitung und Admins) – Untergruppen (Teams)
// verwaltet die Leitung der Klasse in der App (Unterricht), hier zählen sie nur mit
export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['teacher', 'admin'] })
  return listGroups(user, await resolveOrganizationId(event, user, isPlatformAdmin))
})
