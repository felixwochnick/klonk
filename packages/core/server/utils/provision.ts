import { and, eq } from 'drizzle-orm'
import { accounts, users } from '../database/schema'

export type ExternalIdentity = {
  organizationId: string
  /** `ldap:<orgId>` oder `oidc:<orgId>` */
  provider: string
  providerAccountId: string
  username: string
  displayName: string
  email?: string | null
  /** `undefined` = keine Rollenzuordnung konfiguriert, bestehende Rolle bleibt */
  role?: MemberRole
}

/**
 * Legt Konten aus LDAP/OIDC beim ersten Login an (Just-in-time) und hält Name/Rolle aktuell.
 * Ein bestehendes Konto mit gleichem Benutzernamen wird nur verknüpft, wenn es kein eigenes Passwort hat –
 * sonst könnte ein gleichnamiger Verzeichniseintrag z. B. das lokale Admin-Konto übernehmen.
 * Gesperrte oder kollidierende Konten liefern `null`.
 */
export async function provisionExternalUser(identity: ExternalIdentity) {
  const username = normalizeUsername(identity.username)
  if (!username) return null

  return useSystemDb().transaction(async (tx) => {
    const [linked] = await tx
      .select({ user: users })
      .from(accounts)
      .innerJoin(users, eq(users.id, accounts.userId))
      .where(and(eq(accounts.provider, identity.provider), eq(accounts.providerAccountId, identity.providerAccountId)))

    let user = linked?.user
    if (!user) {
      [user] = await tx.select().from(users)
        .where(and(eq(users.organizationId, identity.organizationId), eq(users.username, username)))
      if (user?.passwordHash) return null
    }

    if (!user) {
      [user] = await tx.insert(users).values({
        organizationId: identity.organizationId,
        username,
        displayName: identity.displayName || username,
        email: identity.email ?? null,
        role: identity.role ?? 'member',
      }).returning()
    }
    else if (user.disabled) {
      return null
    }
    else {
      [user] = await tx.update(users).set({
        displayName: identity.displayName || user.displayName,
        email: identity.email ?? user.email,
        ...(identity.role ? { role: identity.role } : {}),
      }).where(eq(users.id, user.id)).returning()
    }

    if (!linked) {
      await tx.insert(accounts).values({
        userId: user!.id,
        provider: identity.provider,
        providerAccountId: identity.providerAccountId,
      }).onConflictDoNothing()
    }

    return user!
  })
}

/** Benutzernamen aus SSO vereinheitlichen: `max@schule.de` ⇒ `max`, nur erlaubte Zeichen */
export function normalizeUsername(raw: string) {
  const local = raw.includes('@') ? raw.slice(0, raw.indexOf('@')) : raw
  return local.trim().toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[^a-z0-9._-]/g, '')
    .slice(0, 64)
}

/** Rolle aus Gruppen-/Claim-Werten ableiten; `undefined`, wenn keine Zuordnung konfiguriert ist */
export function mapRole(values: string[], teacherValues?: string[], adminValues?: string[]): MemberRole | undefined {
  if (!teacherValues?.length && !adminValues?.length) return undefined
  const has = (list?: string[]) => list?.some(v => values.some(x => x.toLowerCase() === v.toLowerCase()))
  if (has(adminValues)) return 'admin'
  if (has(teacherValues)) return 'teacher'
  return 'member'
}
