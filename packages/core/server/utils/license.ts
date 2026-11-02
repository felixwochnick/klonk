import { count, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { importSPKI, jwtVerify, decodeJwt, decodeProtectedHeader, type JWTPayload } from 'jose'
import { instanceSettings, organizations, userLicenses, users } from '../database/schema'
import { LICENSE_FEATURES } from '../../shared/utils/license'
import { DEV_LICENSE_PUBLIC_KEYS, LICENSE_PUBLIC_KEYS } from './license-keys'

type LicenseClaims = JWTPayload & {
  /** Name des Kunden (Schule, Unternehmen, Person) */
  name?: string
  plan?: string
  /** `null`/fehlend = unbegrenzt */
  maxUsers?: number | null
  features?: string[]
  /** Optional: Token gilt nur für diese Domains (inkl. Subdomains) */
  domains?: string[]
}

export type VerifyOptions = {
  /** Testschlüssel zulassen (nur Entwicklung) */
  allowDevKeys?: boolean
  /** Host der Instanz, z. B. `app.klonk.example` – für die Domainbindung */
  host?: string
  now?: Date
}

/**
 * Prüft ein Lizenz-Token offline gegen die eingebauten öffentlichen Schlüssel.
 * Ungültige oder abgelaufene Tokens ergeben die kostenlose Version (mit `problem`).
 */
export async function verifyLicenseToken(token: string, options: VerifyOptions = {}): Promise<LicenseInfo> {
  const now = options.now ?? new Date()
  let claims: LicenseClaims

  try {
    const { kid, alg } = decodeProtectedHeader(token)
    const pem = (kid && LICENSE_PUBLIC_KEYS[kid]) || (options.allowDevKeys && kid ? DEV_LICENSE_PUBLIC_KEYS[kid] : undefined)
    if (!pem || alg !== 'EdDSA') return { ...FREE_LICENSE, problem: 'invalid' }

    const key = await importSPKI(pem, 'EdDSA')
    // Ablauf prüfen wir selbst (Kulanzzeit), alles andere jose
    const result = await jwtVerify<LicenseClaims>(token, key, {
      issuer: 'klonk',
      algorithms: ['EdDSA'],
      currentDate: new Date(0),
    })
    claims = result.payload
  }
  catch {
    return { ...FREE_LICENSE, problem: 'invalid' }
  }

  if (claims.domains?.length && options.host) {
    const host = options.host.toLowerCase()
    const matches = claims.domains.some(d => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`))
    if (!matches) return { ...FREE_LICENSE, problem: 'wrong_domain' }
  }

  const expiresAt = claims.exp ? new Date(claims.exp * 1000) : null
  let problem: LicenseInfo['problem'] = null
  if (expiresAt && expiresAt < now) {
    const graceEnd = new Date(expiresAt.getTime() + LICENSE_GRACE_DAYS * 24 * 60 * 60 * 1000)
    if (graceEnd < now) return { ...FREE_LICENSE, expiresAt: expiresAt.toISOString(), problem: 'expired' }
    problem = 'grace'
  }

  return {
    plan: claims.plan ?? 'pro',
    licensee: claims.name ?? claims.sub ?? null,
    maxUsers: typeof claims.maxUsers === 'number' ? claims.maxUsers : null,
    features: (claims.features ?? []).filter((f): f is LicenseFeature => (LICENSE_FEATURES as readonly string[]).includes(f)),
    expiresAt: expiresAt?.toISOString() ?? null,
    problem,
  }
}

export function verifyForInstance(token: string | null | undefined) {
  if (!token) return Promise.resolve(FREE_LICENSE)
  return verifyLicenseToken(token, {
    allowDevKeys: import.meta.dev,
    host: new URL(useRuntimeConfig().public.appUrl).hostname,
  })
}

// Instanz-Lizenz kurz zwischenspeichern – wird bei vielen Anfragen gebraucht
let instanceCache: { license: LicenseInfo, at: number } | undefined
const CACHE_MS = 60_000

/** Einstellung für automatisch verlängerte Tokens, wenn das Token aus NUXT_LICENSE_TOKEN kommt */
export const REFRESHED_LICENSE_KEY = 'license_refreshed'

/**
 * `candidate` statt `current`, wenn beide zur selben Lizenz gehören (`sid` von klonk.*) und `candidate` länger gilt.
 * Nur Auswahl – geprüft wird das Ergebnis danach wie jedes Token.
 */
export function newerLicenseToken(current: string, candidate: string | null | undefined) {
  if (!candidate || candidate === current) return current
  try {
    const a = decodeJwt(current)
    const b = decodeJwt(candidate)
    if (!a.sid || a.sid !== b.sid) return current
    return (b.exp ?? 0) > (a.exp ?? 0) ? candidate : current
  }
  catch {
    return current
  }
}

export async function getInstanceLicenseToken() {
  const fromEnv = useRuntimeConfig().licenseToken
  if (fromEnv) {
    // Vom Lizenzserver verlängertes Token derselben Lizenz (siehe license-sync.ts)
    const [refreshed] = await useSystemDb().select().from(instanceSettings).where(eq(instanceSettings.key, REFRESHED_LICENSE_KEY))
    return { token: newerLicenseToken(fromEnv, refreshed?.value as string | undefined), source: 'env' as const }
  }
  const [row] = await useSystemDb().select().from(instanceSettings).where(eq(instanceSettings.key, 'license'))
  return { token: (row?.value as string | undefined) ?? null, source: 'db' as const }
}

/** Lizenz der Instanz (Token aus NUXT_LICENSE_TOKEN oder aus der Verwaltung) */
export async function getInstanceLicense() {
  if (instanceCache && Date.now() - instanceCache.at < CACHE_MS) return instanceCache.license
  const { token } = await getInstanceLicenseToken()
  const license = await verifyForInstance(token)
  instanceCache = { license, at: Date.now() }
  return license
}

export function clearLicenseCache() {
  instanceCache = undefined
}

export async function getOrganizationLicense(organizationId: string) {
  const [org] = await useSystemDb().select({ token: organizations.licenseToken }).from(organizations)
    .where(eq(organizations.id, organizationId))
  return verifyForInstance(org?.token)
}

/** `localhost`, `*.localhost`, `127.0.0.1`, `::1` – Namen, die jeder Browser nur auf den eigenen Rechner auflöst */
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[?::1\]?|[a-z0-9.-]+\.localhost)$/i

/**
 * Lokaler Testmodus (vom User so festgelegt): auf dem eigenen Rechner (z. B. app.klonk.localhost) ist alles
 * freigeschaltet. Nur, wenn **beide** lokal sind – der Host der Anfrage und der Hostname, den die Seite im Browser
 * selbst meldet (Header `x-klonk-host` aus `location.hostname`). Wer über eine echte Domain zugreift, hat dort immer
 * diese Domain; ein Proxy, der beides umschreibt, umgeht absichtlich die Lizenzprüfung (ELv2 verbietet das).
 * Abschaltbar mit `NUXT_LICENSE_LOCAL_MODE=off` bzw. pro Anfrage mit `x-klonk-local: off` (E2E-Tests der Grenzen).
 */
export function isLocalTest(event: H3Event | undefined) {
  if (!event || useRuntimeConfig().licenseLocalMode === 'off') return false
  if (getHeader(event, 'x-klonk-local') === 'off') return false
  const host = (getHeader(event, 'host') ?? '').replace(/:\d+$/, '')
  const client = getHeader(event, 'x-klonk-host') ?? ''
  return LOCAL_HOST.test(host) && LOCAL_HOST.test(client)
}

/** Lizenz im lokalen Testmodus: alle Funktionen, keine Grenzen (nur nicht „gehostet“) */
export const LOCAL_LICENSE: LicenseInfo = {
  plan: 'local',
  licensee: null,
  maxUsers: null,
  features: LICENSE_FEATURES.filter(f => f !== 'hosted'),
  expiresAt: null,
  problem: null,
}

export async function getUserLicense(userId: string) {
  const [row] = await useSystemDb().select({ token: userLicenses.token }).from(userLicenses)
    .where(eq(userLicenses.userId, userId))
  return verifyForInstance(row?.token)
}

/**
 * Wirksame Lizenz für eine Organisation (oder Privatkonten mit `null`):
 * - Selbsthosting: die Instanz-Lizenz gilt für alle
 * - Gehostete Plattform (Feature `hosted`): jede Organisation hat ihr eigenes Token, Privatkonten ihr Privat-Abo
 *   (`userId`), sonst kostenlos
 */
export async function getEffectiveLicense(organizationId: string | null, event?: H3Event, userId?: string | null): Promise<LicenseInfo> {
  if (isLocalTest(event)) return LOCAL_LICENSE
  const instance = await getInstanceLicense()
  if (!hasFeature(instance, 'hosted')) return instance
  if (organizationId) return getOrganizationLicense(organizationId)
  // Kontengrenzen gelten für Privatkonten nicht
  const license = userId ? await getUserLicense(userId) : FREE_LICENSE
  return { ...license, maxUsers: null }
}

export async function requireFeature(organizationId: string | null, feature: LicenseFeature, event?: H3Event) {
  const license = await getEffectiveLicense(organizationId, event)
  if (!hasFeature(license, feature))
    throw createError({ statusCode: 402, message: 'feature_required', data: { feature } })
}

async function countUsers(organizationId?: string) {
  const query = useSystemDb().select({ n: count() }).from(users)
  const [row] = organizationId ? await query.where(eq(users.organizationId, organizationId)) : await query
  return row?.n ?? 0
}

/** Nutzerstand (inkl. Warn-/Sperrstatus) – gehostet pro Organisation, sonst für die ganze Instanz */
export async function getUserUsage(organizationId: string | null): Promise<UserUsage> {
  const instance = await getInstanceLicense()
  if (hasFeature(instance, 'hosted') && organizationId)
    return userUsage(await countUsers(organizationId), await getOrganizationLicense(organizationId))
  return userUsage(await countUsers(), instance)
}

/** Vor dem Anlegen eines Kontos: Grenze der Lizenz inkl. Puffer einhalten */
export async function assertUserCapacity(organizationId: string | null, event?: H3Event) {
  if (isLocalTest(event)) return
  const instance = await getInstanceLicense()
  if (userUsage(await countUsers(), instance).status === 'blocked')
    throw createError({ statusCode: 402, message: 'user_limit_reached' })

  if (hasFeature(instance, 'hosted') && organizationId) {
    const license = await getOrganizationLicense(organizationId)
    if (userUsage(await countUsers(organizationId), license).status === 'blocked')
      throw createError({ statusCode: 402, message: 'user_limit_reached' })
  }
}
