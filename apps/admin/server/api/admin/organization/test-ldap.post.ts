// Verbindungstest mit den (noch nicht gespeicherten) Formularwerten
export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)
  const input = await readValidated(event, authSettingsSchema)
  if (!input.ldap) throw createError({ statusCode: 400, message: 'ldap_incomplete' })

  const { ldap } = await withUserDb(user.id, tx => resolveSecrets(tx, organizationId, input))
  try {
    const result = await testLdapConnection(ldap!)
    return { ok: true, users: result.users }
  }
  catch (error) {
    return { ok: false, message: (error as Error).message }
  }
})
