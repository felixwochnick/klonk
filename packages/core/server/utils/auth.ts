import type { H3Event } from 'h3'
import { and, eq, gt, ne, sql } from 'drizzle-orm'
import { organizations, sessions, users } from '../database/schema'

type UserRow = typeof users.$inferSelect

/** Liest Nutzer + Organisation und baut daraus die Session-Daten */
export async function loadSessionUser(userId: string): Promise<SessionUser | null> {
  const [row] = await useSystemDb()
    .select({ user: users, organization: organizations })
    .from(users)
    .leftJoin(organizations, eq(organizations.id, users.organizationId))
    .where(eq(users.id, userId))
    .limit(1)

  if (!row || row.user.disabled) return null
  const { user, organization } = row

  return {
    id: user.id,
    displayName: user.displayName,
    username: user.username,
    email: user.email,
    organizationId: organization?.id ?? null,
    organizationName: organization?.name ?? null,
    organizationType: organization?.type ?? null,
    domain: organization?.domain ?? null,
    role: user.role,
    platformRole: user.platformRole,
    mustChangePassword: user.mustChangePassword,
    hasPassword: !!user.passwordHash,
  }
}

/** Legt eine serverseitige Session an und setzt das Session-Cookie */
export async function startUserSession(event: H3Event, user: Pick<UserRow, 'id'>) {
  const { session: { maxAge } } = useRuntimeConfig()
  const db = useSystemDb()

  const [session] = await db.insert(sessions).values({
    userId: user.id,
    expiresAt: new Date(Date.now() + maxAge * 1000),
    userAgent: getRequestHeader(event, 'user-agent')?.slice(0, 500),
  }).returning({ id: sessions.id })

  await db.update(users).set({ lastLoginAt: sql`now()` }).where(eq(users.id, user.id))

  const sessionUser = await loadSessionUser(user.id)
  if (!sessionUser || !session) throw createError({ statusCode: 403, message: 'account_disabled' })

  await replaceUserSession(event, { user: sessionUser, sessionId: session.id })
  return sessionUser
}

/** Beendet die aktuelle Session (Cookie + DB) */
export async function endUserSession(event: H3Event) {
  const session = await getUserSession(event)
  if (session.sessionId) await useSystemDb().delete(sessions).where(eq(sessions.id, session.sessionId))
  await clearUserSession(event)
}

/** Meldet einen Nutzer auf allen Geräten ab, optional bis auf die aktuelle Session */
export async function revokeUserSessions(userId: string, exceptSessionId?: string) {
  await useSystemDb().delete(sessions).where(and(
    eq(sessions.userId, userId),
    exceptSessionId ? ne(sessions.id, exceptSessionId) : undefined,
  ))
}

/** Prüft, ob die Session in der DB noch gültig ist (Logout, Passwort-Reset, gesperrtes Konto) */
export async function isSessionValid(sessionId: string, userId: string) {
  const [row] = await useSystemDb()
    .select({ id: sessions.id })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(
      eq(sessions.id, sessionId),
      eq(sessions.userId, userId),
      gt(sessions.expiresAt, sql`now()`),
      eq(users.disabled, false),
    ))
    .limit(1)
  return !!row
}

/** Angemeldeten Nutzer erzwingen; optional mit Mindestrolle in der Organisation */
export async function requireAuth(event: H3Event, options: { roles?: MemberRole[], platformAdmin?: boolean } = {}) {
  const { user, sessionId } = await requireUserSession(event)
  const isPlatformAdmin = user.platformRole !== 'user'

  if (options.platformAdmin && !isPlatformAdmin)
    throw createError({ statusCode: 403, message: 'forbidden' })
  if (options.roles && !options.roles.includes(user.role) && !isPlatformAdmin)
    throw createError({ statusCode: 403, message: 'forbidden' })

  return { user, sessionId: sessionId as string, isPlatformAdmin }
}

/** `username@domain` zerlegen (Domain case-insensitiv) */
export function parseIdentifier(identifier: string) {
  const at = identifier.lastIndexOf('@')
  if (at <= 0 || at === identifier.length - 1) return null
  return {
    username: identifier.slice(0, at).trim().toLowerCase(),
    domain: identifier.slice(at + 1).trim().toLowerCase(),
  }
}

/** Erlaubte Weiterleitungsziele nach dem Login (Apps, zentrale Anmeldung, Website, eigene Seite) */
export function allowedOriginsFor(event: H3Event) {
  return [...allowedRedirectOrigins(useRuntimeConfig().public), requestOrigin(event)]
}

const REDIRECT_COOKIE = 'klonk-redirect'

/** Merkt sich das Weiterleitungsziel über den Umweg zum OAuth-Anbieter */
export function rememberRedirect(event: H3Event) {
  const { redirect, code } = getQuery(event)
  if (code || typeof redirect !== 'string') return
  setCookie(event, REDIRECT_COOKIE, safeRedirectTarget(redirect, allowedOriginsFor(event)), {
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'lax',
    path: '/auth',
    maxAge: 600,
  })
}

export function takeRememberedRedirect(event: H3Event) {
  const target = getCookie(event, REDIRECT_COOKIE)
  deleteCookie(event, REDIRECT_COOKIE, { path: '/auth' })
  return safeRedirectTarget(target, allowedOriginsFor(event))
}
