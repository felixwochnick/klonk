import { and, eq } from 'drizzle-orm'
import { organizationAuthSettings, organizations, users } from '../database/schema'

export async function findOrganizationByDomain(domain: string) {
  const [row] = await useSystemDb()
    .select({ organization: organizations, settings: organizationAuthSettings })
    .from(organizations)
    .leftJoin(organizationAuthSettings, eq(organizationAuthSettings.organizationId, organizations.id))
    .where(eq(organizations.domain, domain.toLowerCase()))
    .limit(1)
  return row ?? null
}

/** Aktive Login-Methoden; OIDC nur mit Lizenz-Feature `oidc` */
export async function loginMethods(organizationId: string, settings: typeof organizationAuthSettings.$inferSelect | null): Promise<LoginMethod[]> {
  const methods: LoginMethod[] = []
  if (settings?.localEnabled ?? true) methods.push('password')
  if (settings?.ldapEnabled && settings.ldap) methods.push('ldap')
  if (settings?.oidcEnabled && settings.oidc && hasFeature(await getEffectiveLicense(organizationId), 'oidc'))
    methods.push('oidc')
  // Ist nur OIDC eingerichtet, aber die Lizenz abgelaufen, bleibt die Anmeldung mit Passwort als Notzugang
  if (!methods.length) methods.push('password')
  return methods
}

/**
 * Anmeldung mit `username@domain` + Passwort: zuerst lokales Konto, danach LDAP der Organisation.
 * Gibt bei jedem Fehler `null` zurück, damit nicht erkennbar ist, welcher Teil falsch war.
 */
export async function loginWithPassword(identifier: string, password: string) {
  const parsed = parseIdentifier(identifier)
  if (!parsed) return null

  const org = await findOrganizationByDomain(parsed.domain)
  if (!org) return null
  const methods = await loginMethods(org.organization.id, org.settings)

  const [user] = await useSystemDb()
    .select()
    .from(users)
    .where(and(eq(users.organizationId, org.organization.id), eq(users.username, parsed.username)))
    .limit(1)

  if (user?.disabled) return null

  if (methods.includes('password') && user?.passwordHash && await verifyPassword(user.passwordHash, password))
    return user

  if (methods.includes('ldap') && org.settings?.ldap)
    return loginWithLdap(org.organization.id, org.settings.ldap, parsed.username, password)

  return null
}
