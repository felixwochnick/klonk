import { Client, type Entry } from 'ldapts'
import type { LdapSettings } from '../database/schema'

/** RFC 4515: Sonderzeichen in Filterwerten maskieren (verhindert LDAP-Injection) */
export function escapeLdapFilter(value: string) {
  return value.replace(/[\\*()\0]/g, c => `\\${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
}

async function connect(settings: LdapSettings) {
  const client = new Client({ url: settings.url, timeout: 10_000, connectTimeout: 10_000 })
  if (settings.startTls) await client.startTLS({})
  return client
}

function attribute(entry: Entry, name: string): string[] {
  const value = entry[name] ?? Object.entries(entry).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1]
  if (value === undefined) return []
  return (Array.isArray(value) ? value : [value]).map(v => (Buffer.isBuffer(v) ? v.toString('utf8') : String(v)))
}

/** Sucht den Nutzer mit dem Service-Konto und prüft das Passwort per Bind als Nutzer */
async function authenticate(settings: LdapSettings, username: string, password: string) {
  // Leere Passwörter würden einen anonymen Bind auslösen – immer ablehnen
  if (!password) return null

  const client = await connect(settings)
  try {
    if (settings.bindDn) await client.bind(settings.bindDn, decryptSecret(settings.bindPassword))

    const filter = settings.userFilter.replaceAll('{{username}}', escapeLdapFilter(username))
    const { searchEntries } = await client.search(settings.baseDn, {
      scope: 'sub',
      filter,
      sizeLimit: 2,
      attributes: ['dn', settings.usernameAttribute, settings.displayNameAttribute, 'mail', 'memberOf'],
    })
    if (searchEntries.length !== 1) return null
    const entry = searchEntries[0]!

    const userClient = await connect(settings)
    try {
      await userClient.bind(entry.dn, password)
    }
    catch {
      return null
    }
    finally {
      await userClient.unbind().catch(() => {})
    }

    return entry
  }
  finally {
    await client.unbind().catch(() => {})
  }
}

export async function loginWithLdap(organizationId: string, settings: LdapSettings, username: string, password: string) {
  let entry: Entry | null
  try {
    entry = await authenticate(settings, username, password)
  }
  catch (error) {
    console.error('[klonk] LDAP-Anmeldung fehlgeschlagen', error)
    return null
  }
  if (!entry) return null

  return provisionExternalUser({
    organizationId,
    provider: `ldap:${organizationId}`,
    providerAccountId: entry.dn.toLowerCase(),
    username: attribute(entry, settings.usernameAttribute)[0] ?? username,
    displayName: attribute(entry, settings.displayNameAttribute)[0] ?? username,
    email: attribute(entry, 'mail')[0],
    role: mapRole(attribute(entry, 'memberOf'), settings.teacherGroups, settings.adminGroups),
  })
}

/** Verbindungstest für die Verwaltung: Service-Bind und Suche nach Nutzern */
export async function testLdapConnection(settings: LdapSettings) {
  const client = await connect(settings)
  try {
    if (settings.bindDn) await client.bind(settings.bindDn, decryptSecret(settings.bindPassword))
    const filter = settings.userFilter.replaceAll('{{username}}', '*')
    const { searchEntries } = await client.search(settings.baseDn, { scope: 'sub', filter, sizeLimit: 1000, attributes: ['dn'] })
    return { ok: true, users: searchEntries.length }
  }
  finally {
    await client.unbind().catch(() => {})
  }
}
