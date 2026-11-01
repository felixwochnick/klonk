import type { H3Event } from 'h3'
import type { RequestEvent } from 'nuxt/server'
import { and, eq } from 'drizzle-orm'
import { accounts, users } from '../database/schema'

export type PrivateIdentity = {
  /** `google`, `microsoft`, `github`, `apple` oder `platform` (Klonk ID, nur Betreiber) */
  provider: string
  providerAccountId: string
  displayName: string
  email?: string | null
  /** Nur für `platform`: aus den Gruppen abgeleitete Betreiberrolle */
  platformRole?: PlatformRole
}

/** Privatkonten (ohne Organisation) anlegen bzw. anhand der Anbieter-ID wiederfinden */
export async function provisionPrivateUser(identity: PrivateIdentity) {
  return useSystemDb().transaction(async (tx) => {
    const [linked] = await tx
      .select({ user: users })
      .from(accounts)
      .innerJoin(users, eq(users.id, accounts.userId))
      .where(and(eq(accounts.provider, identity.provider), eq(accounts.providerAccountId, identity.providerAccountId)))

    if (linked) {
      // Betreiberkonten steuern die Klonk-ID-Gruppen (Sperre beim Gruppenentzug, Freigabe bei Rückkehr)
      const isPlatform = identity.provider === 'platform'
      if (linked.user.disabled && !isPlatform) return null
      const [user] = await tx.update(users).set({
        displayName: identity.displayName || linked.user.displayName,
        email: identity.email ?? linked.user.email,
        // Betreiberrechte folgen immer den aktuellen Gruppen – Entzug wirkt beim nächsten Login
        ...(isPlatform ? { platformRole: identity.platformRole ?? 'user', disabled: false } : {}),
      }).where(eq(users.id, linked.user.id)).returning()
      return user!
    }

    // Betreiberkonten zählen nicht gegen die Nutzergrenze
    if (identity.provider !== 'platform') await assertUserCapacity(null)
    const [user] = await tx.insert(users).values({
      organizationId: null,
      displayName: identity.displayName || identity.email || 'Klonk',
      email: identity.email ?? null,
      platformRole: identity.platformRole ?? 'user',
    }).returning()
    await tx.insert(accounts).values({
      userId: user!.id,
      provider: identity.provider,
      providerAccountId: identity.providerAccountId,
    })
    return user!
  })
}

// nuxt-auth-utils typisiert Events als `RequestEvent` – zur Laufzeit dasselbe Objekt wie das H3Event
const toH3Event = (event: RequestEvent | H3Event) => event as H3Event

/** Umhüllt einen OAuth-Handler von nuxt-auth-utils: merkt sich `?redirect=` für die Rückkehr */
export function withRememberedRedirect(handler: (event: RequestEvent) => unknown) {
  return defineEventHandler((event) => {
    rememberRedirect(event)
    return handler(event as unknown as RequestEvent)
  })
}

/** Gemeinsamer Abschluss der OAuth-Anbieter (nuxt-auth-utils) */
export async function finishPrivateLogin(requestEvent: RequestEvent, identity: PrivateIdentity) {
  const event = toH3Event(requestEvent)
  try {
    const user = await provisionPrivateUser(identity)
    if (!user) return sendRedirect(event, '/login?error=account_disabled')
    await startUserSession(event, user)
    return sendRedirect(event, takeRememberedRedirect(event))
  }
  catch (error) {
    return privateLoginFailed(event, error)
  }
}

export function privateLoginFailed(event: RequestEvent | H3Event, error: unknown) {
  if ((error as { message?: string }).message === 'user_limit_reached')
    return sendRedirect(toH3Event(event), '/login?error=user_limit_reached')
  console.error('[klonk] OAuth-Anmeldung fehlgeschlagen', error)
  return sendRedirect(toH3Event(event), '/login?error=sso_failed')
}

/** Klonk ID: plattformweiter OIDC-Anbieter (z. B. Authentik), nur für Betreiber (Besitzer:innen, Entwickler:innen) */
export function platformOidcSettings(): OidcClientSettings | null {
  const { platformOidc } = useRuntimeConfig()
  if (!platformOidc.issuer || !platformOidc.clientId) return null
  return {
    issuer: platformOidc.issuer,
    clientId: platformOidc.clientId,
    clientSecretPlain: platformOidc.clientSecret,
    scopes: platformOidc.scopes,
    usernameClaim: 'preferred_username',
    roleClaim: platformOidc.groupsClaim,
  }
}

function groupList(value: string) {
  return value.split(',').map(v => v.trim()).filter(Boolean)
}

async function revokePlatformAccount(providerAccountId: string) {
  const db = useSystemDb()
  const [linked] = await db.select({ userId: accounts.userId }).from(accounts)
    .where(and(eq(accounts.provider, 'platform'), eq(accounts.providerAccountId, providerAccountId)))
  if (!linked) return
  await db.update(users).set({ platformRole: 'user', disabled: true }).where(eq(users.id, linked.userId))
  await revokeUserSessions(linked.userId)
}

export async function finishPlatformLogin(event: H3Event, state: OidcState) {
  const settings = platformOidcSettings()
  if (!settings) return sendRedirect(event, '/login?error=sso_failed')

  try {
    const { platformOidc } = useRuntimeConfig()
    const claims = await finishOidcLogin(event, settings, state)
    const groups = claimValues(claims[platformOidc.groupsClaim])
    const has = (list: string) => groupList(list).some(g => groups.includes(g))
    const platformRole: PlatformRole = has(platformOidc.ownerGroups) ? 'owner' : has(platformOidc.developerGroups) ? 'developer' : 'user'

    // Klonk ID ist ausschließlich der Betreiberzugang – ohne Betreiber-Gruppe kein Login.
    // Wurde jemand aus der Gruppe entfernt, verliert das bestehende Konto sofort seine Rechte.
    if (platformRole === 'user') {
      await revokePlatformAccount(String(claims.sub))
      return sendRedirect(event, '/login?error=not_operator')
    }

    const user = await provisionPrivateUser({
      provider: 'platform',
      providerAccountId: String(claims.sub),
      displayName: String(claims.name ?? claims.preferred_username ?? ''),
      email: typeof claims.email === 'string' ? claims.email : null,
      platformRole,
    })
    if (!user) return sendRedirect(event, '/login?error=account_disabled')

    await startUserSession(event, user)
    return sendRedirect(event, state.redirect)
  }
  catch (error) {
    return privateLoginFailed(event, error)
  }
}
