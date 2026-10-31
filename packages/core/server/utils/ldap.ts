import type { LdapSettings } from '../database/schema'

// Wird im nächsten Schritt implementiert (LDAP-Bind + JIT-Provisionierung)
export async function loginWithLdap(_organizationId: string, _settings: LdapSettings, _username: string, _password: string) {
  return null
}
