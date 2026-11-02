import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)
  const input = await readValidated(event, authSettingsSchema.refine(v => v.localEnabled || v.oidcEnabled || v.ldapEnabled, { message: 'no_login_method' })
    .refine(v => !v.oidcEnabled || v.oidc, { message: 'oidc_incomplete' })
    .refine(v => !v.ldapEnabled || v.ldap, { message: 'ldap_incomplete' }))

  // SSO per OIDC ist Teil der Lizenz (LDAP und lokale Konten sind kostenlos)
  if (input.oidcEnabled) await requireFeature(organizationId, 'oidc', event)

  const table = schema.organizationAuthSettings

  return withUserDb(user.id, async (tx) => {
    const { oidc, ldap } = await resolveSecrets(tx, organizationId, input)

    await tx.update(table).set({
      localEnabled: input.localEnabled,
      oidcEnabled: input.oidcEnabled,
      oidc,
      ldapEnabled: input.ldapEnabled,
      ldap,
      updatedAt: new Date(),
    }).where(eq(table.organizationId, organizationId))

    return { ok: true }
  })
})
