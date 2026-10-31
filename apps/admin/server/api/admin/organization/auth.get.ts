import { eq } from 'drizzle-orm'

// Login-Methoden der Organisation – Secrets werden nie ausgeliefert
export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)

  const [settings] = await withUserDb(user.id, tx => tx.select().from(schema.organizationAuthSettings)
    .where(eq(schema.organizationAuthSettings.organizationId, organizationId)))

  return {
    localEnabled: settings?.localEnabled ?? true,
    oidcEnabled: settings?.oidcEnabled ?? false,
    oidc: settings?.oidc ? { ...settings.oidc, clientSecret: '', hasClientSecret: !!settings.oidc.clientSecret } : null,
    ldapEnabled: settings?.ldapEnabled ?? false,
    ldap: settings?.ldap ? { ...settings.ldap, bindPassword: '', hasBindPassword: !!settings.ldap.bindPassword } : null,
  }
})
