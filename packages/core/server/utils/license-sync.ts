import { decodeJwt } from 'jose'
import { eq, sql } from 'drizzle-orm'
import { instanceSettings, organizations, userLicenses, users } from '../database/schema'
import type { Db } from './db'

/**
 * Abgleich mit dem Lizenzserver klonk.* (privates Repo klonk-web):
 * - Instanz-Token verlängern (`POST /api/v1/license/refresh`) – Selbsthosting, abschaltbar per NUXT_LICENSE_AUTO_REFRESH=false
 * - Gehostete Plattform: Organisations- und Privat-Lizenzen übernehmen (`GET /api/v1/platform/licenses`, Bearer-Schlüssel)
 * Es wird nur das Token gesendet, keine Nutzerdaten.
 */
export type LicenseSyncDeps = {
  db: Db
  serverUrl: string
  /** Prüft ein Token wie die Instanz (Signatur, Domain) – ungültige werden nie gespeichert */
  verify: (token: string) => Promise<LicenseInfo>
  fetch?: typeof globalThis.fetch
}

function isUsable(license: LicenseInfo) {
  return license.problem === null || license.problem === 'grace'
}

function claim(token: string, name: string) {
  try {
    return decodeJwt(token)[name]
  }
  catch {
    return undefined
  }
}

/**
 * Fragt für das aktuelle Instanz-Token das neueste Token derselben Lizenz ab und speichert es, wenn es länger gilt.
 * `source: 'env'` ⇒ in `license_refreshed` (NUXT_LICENSE_TOKEN bleibt unverändert), sonst in `license`.
 */
export async function refreshInstanceLicense(deps: LicenseSyncDeps, current: { token: string | null, source: 'env' | 'db' }) {
  if (!current.token || !claim(current.token, 'sid')) return false
  const res = await (deps.fetch ?? fetch)(new URL('/api/v1/license/refresh', deps.serverUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: current.token }),
  })
  if (!res.ok) return false
  const { token } = await res.json() as { token?: string }
  if (!token || token === current.token || newerLicenseToken(current.token, token) !== token) return false
  if (!isUsable(await deps.verify(token))) return false

  const key = current.source === 'env' ? REFRESHED_LICENSE_KEY : 'license'
  await deps.db.insert(instanceSettings).values({ key, value: token })
    .onConflictDoUpdate({ target: instanceSettings.key, set: { value: token, updatedAt: sql`now()` } })
  return true
}

/** Shop-Token übernehmen, wenn noch keins da ist, das vorhandene unbrauchbar ist oder das neue länger gilt */
async function shouldReplace(deps: LicenseSyncDeps, existing: string | null | undefined, candidate: string) {
  if (!existing) return true
  if (existing === candidate) return false
  if (!isUsable(await deps.verify(existing))) return true
  return Number(claim(candidate, 'exp') ?? 0) > Number(claim(existing, 'exp') ?? 0)
}

type PlatformLicenses = {
  organizations: { organizationId: string, token: string }[]
  users: { userId: string, token: string }[]
}

/** Gehostete Plattform: Tokens aus dem Shop den Organisationen bzw. Privatkonten zuordnen */
export async function syncHostedLicenses(deps: LicenseSyncDeps & { apiKey: string }) {
  const res = await (deps.fetch ?? fetch)(new URL('/api/v1/platform/licenses', deps.serverUrl), {
    headers: { authorization: `Bearer ${deps.apiKey}` },
  })
  if (!res.ok) throw new Error(`Lizenzserver antwortet mit ${res.status}`)
  const data = await res.json() as PlatformLicenses
  let changed = 0

  for (const { organizationId, token } of data.organizations ?? []) {
    // Das Token muss selbst die Organisation nennen – der Shop kann keine fremden Organisationen freischalten
    if (claim(token, 'organizationId') !== organizationId || !isUsable(await deps.verify(token))) continue
    const [org] = await deps.db.select({ token: organizations.licenseToken }).from(organizations).where(eq(organizations.id, organizationId))
    if (!org || !await shouldReplace(deps, org.token, token)) continue
    await deps.db.update(organizations).set({ licenseToken: token }).where(eq(organizations.id, organizationId))
    changed++
  }

  for (const { userId, token } of data.users ?? []) {
    if (claim(token, 'userId') !== userId || !isUsable(await deps.verify(token))) continue
    // Nur Privatkonten
    const [user] = await deps.db.select({ organizationId: users.organizationId }).from(users).where(eq(users.id, userId))
    if (!user || user.organizationId) continue
    const [existing] = await deps.db.select({ token: userLicenses.token }).from(userLicenses).where(eq(userLicenses.userId, userId))
    if (!await shouldReplace(deps, existing?.token, token)) continue
    await deps.db.insert(userLicenses).values({ userId, token })
      .onConflictDoUpdate({ target: userLicenses.userId, set: { token, updatedAt: sql`now()` } })
    changed++
  }
  return changed
}
