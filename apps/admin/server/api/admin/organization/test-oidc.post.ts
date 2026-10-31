// Prüft, ob der Issuer erreichbar ist und eine gültige OIDC-Konfiguration liefert
export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)
  const input = await readValidated(event, authSettingsSchema)
  if (!input.oidc) throw createError({ statusCode: 400, message: 'oidc_incomplete' })

  const { oidc } = await withUserDb(user.id, tx => resolveSecrets(tx, organizationId, input))
  try {
    const config = await discoverOidc(oidc!)
    return { ok: true, message: config.serverMetadata().issuer }
  }
  catch (error) {
    return { ok: false, message: (error as Error).message }
  }
})
