// Konten der Organisation – die Sichtbarkeit begrenzt zusätzlich RLS
export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['teacher', 'admin'] })
  return listUsers(user, await resolveOrganizationId(event, user, isPlatformAdmin))
})
