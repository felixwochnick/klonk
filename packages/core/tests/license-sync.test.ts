import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { importPKCS8, SignJWT } from 'jose'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { instanceSettings, organizations, userLicenses, users } from '../server/database/schema'
import { createDb, type Db } from '../server/utils/db'

// Nuxt-Auto-Imports, die die Module beim Laden erwarten
const shared = await import('../shared/utils/license')
for (const [name, value] of Object.entries(shared)) vi.stubGlobal(name, value)
vi.stubGlobal('useSystemDb', () => {
  throw new Error('nicht im Unit-Test')
})
const license = await import('../server/utils/license')
for (const name of ['newerLicenseToken', 'REFRESHED_LICENSE_KEY'] as const) vi.stubGlobal(name, license[name])
const { refreshInstanceLicense, syncHostedLicenses, syncPlatformInstanceLicense } = await import('../server/utils/license-sync')
const { newerLicenseToken, verifyLicenseToken } = license

const baseUrl = process.env.KLONK_TEST_DATABASE_URL ?? 'postgres://klonk:klonk@localhost:5432/klonk'
const testDbName = 'klonk_license_sync_test'
const testUrl = baseUrl.replace(/\/[^/]+$/, `/${testDbName}`)

const devKey = await importPKCS8(readFileSync(new URL('./fixtures/dev-license-key.pem', import.meta.url), 'utf8'), 'EdDSA')
const now = new Date('2026-06-01T00:00:00Z')

function sign(claims: Record<string, unknown>, exp: string) {
  return new SignJWT({ name: 'Test', plan: 'self-hosted', features: ['oidc'], ...claims })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'klonk-dev' })
    .setIssuer('klonk')
    .setExpirationTime(new Date(exp))
    .sign(devKey)
}

/** Lizenzserver-Attrappe: antwortet je Pfad mit festen Daten */
function server(routes: Record<string, unknown>) {
  const calls: { path: string, init?: RequestInit }[] = []
  const fetch = (async (input: URL | string, init?: RequestInit) => {
    const path = new URL(input).pathname
    calls.push({ path, init })
    return path in routes ? Response.json(routes[path]) : new Response('not found', { status: 404 })
  }) as typeof globalThis.fetch
  return { fetch, calls }
}

let db: Db
const verify = (token: string) => verifyLicenseToken(token, { allowDevKeys: true, now })

beforeAll(async () => {
  const admin = postgres(baseUrl, { max: 1, onnotice: () => {} })
  await admin.unsafe(`drop database if exists ${testDbName} with (force)`)
  await admin.unsafe(`create database ${testDbName}`)
  await admin.end()
  const client = postgres(testUrl, { max: 1, onnotice: () => {} })
  await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL('../server/database/migrations', import.meta.url)) })
  await client.end()
  db = createDb(testUrl)
})

afterAll(async () => {
  await (db?.$client as postgres.Sql | undefined)?.end()
})

describe('newerLicenseToken', () => {
  it('wählt nur ein länger gültiges Token derselben Lizenz', async () => {
    const old = await sign({ sid: 'a' }, '2026-07-01')
    const renewed = await sign({ sid: 'a' }, '2027-07-01')
    const other = await sign({ sid: 'b' }, '2028-07-01')
    expect(newerLicenseToken(old, renewed)).toBe(renewed)
    expect(newerLicenseToken(renewed, old)).toBe(renewed)
    expect(newerLicenseToken(old, other)).toBe(old)
    expect(newerLicenseToken(old, null)).toBe(old)
  })
})

describe('refreshInstanceLicense', () => {
  it('speichert das verlängerte Token (env ⇒ license_refreshed, sonst license)', async () => {
    const old = await sign({ sid: 'inst' }, '2026-06-10')
    const renewed = await sign({ sid: 'inst' }, '2027-06-10')
    const { fetch, calls } = server({ '/api/v1/license/refresh': { token: renewed } })
    const deps = { db, serverUrl: 'https://klonk.test', verify, fetch }

    expect(await refreshInstanceLicense(deps, { token: old, source: 'env' })).toBe(true)
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({ token: old })
    const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.key, 'license_refreshed'))
    expect(row!.value).toBe(renewed)

    expect(await refreshInstanceLicense(deps, { token: old, source: 'db' })).toBe(true)
    const [dbRow] = await db.select().from(instanceSettings).where(eq(instanceSettings.key, 'license'))
    expect(dbRow!.value).toBe(renewed)

    // Gleiches Token zurück ⇒ nichts zu tun; Tokens ohne `sid` (manuell ausgestellt) werden nicht angefragt
    expect(await refreshInstanceLicense({ ...deps, fetch: server({ '/api/v1/license/refresh': { token: renewed } }).fetch }, { token: renewed, source: 'db' })).toBe(false)
    const manual = server({})
    expect(await refreshInstanceLicense({ ...deps, fetch: manual.fetch }, { token: await sign({}, '2027-01-01'), source: 'db' })).toBe(false)
    expect(manual.calls).toHaveLength(0)
  })

  it('verwirft ungültige Antworten', async () => {
    const old = await sign({ sid: 'x' }, '2026-06-10')
    const forged = `${(await sign({ sid: 'x' }, '2030-01-01')).slice(0, -4)}AAAA`
    const { fetch } = server({ '/api/v1/license/refresh': { token: forged } })
    expect(await refreshInstanceLicense({ db, serverUrl: 'https://klonk.test', verify, fetch }, { token: old, source: 'env' })).toBe(false)
  })
})

describe('syncHostedLicenses', () => {
  it('übernimmt Organisations- und Privat-Lizenzen, die zum Ziel passen', async () => {
    const [org, otherOrg] = await db.insert(organizations).values([
      { type: 'school', name: 'Schule', domain: 'schule.test' },
      { type: 'school', name: 'Andere', domain: 'andere.test' },
    ]).returning()
    const [privateUser, orgUser] = await db.insert(users).values([
      { displayName: 'Privat', email: 'p@example.com' },
      { organizationId: org!.id, username: 'lehrer', displayName: 'Lehrer' },
    ]).returning()

    const orgToken = await sign({ sid: 's1', organizationId: org!.id }, '2027-06-01')
    const mismatched = await sign({ sid: 's2', organizationId: org!.id }, '2027-06-01')
    const userToken = await sign({ sid: 's3', userId: privateUser!.id, plan: 'private' }, '2026-07-01')
    const orgUserToken = await sign({ sid: 's4', userId: orgUser!.id }, '2026-07-01')
    const { fetch, calls } = server({
      '/api/v1/platform/licenses': {
        organizations: [{ organizationId: org!.id, token: orgToken }, { organizationId: otherOrg!.id, token: mismatched }],
        users: [{ userId: privateUser!.id, token: userToken }, { userId: orgUser!.id, token: orgUserToken }],
      },
    })
    const deps = { db, serverUrl: 'https://klonk.test', verify, fetch, apiKey: 'geheim' }

    expect(await syncHostedLicenses(deps)).toBe(2)
    expect(new Headers(calls[0]!.init!.headers).get('authorization')).toBe('Bearer geheim')
    const orgs = await db.select().from(organizations)
    expect(orgs.find(o => o.id === org!.id)!.licenseToken).toBe(orgToken)
    expect(orgs.find(o => o.id === otherOrg!.id)!.licenseToken).toBeNull()
    expect(await db.select().from(userLicenses)).toEqual([expect.objectContaining({ userId: privateUser!.id, token: userToken })])

    // Zweiter Lauf: nichts mehr zu tun
    expect(await syncHostedLicenses(deps)).toBe(0)
  })
})

describe('syncPlatformInstanceLicense', () => {
  it('übernimmt nur Tokens mit hosted und nur, wenn sie länger gelten', async () => {
    await db.delete(instanceSettings).where(eq(instanceSettings.key, 'license'))
    const selfHosted = await sign({ sid: 'cloud' }, '2027-06-01')
    const hosted = await sign({ sid: 'cloud', plan: 'hosted', features: ['hosted', 'cloud'] }, '2027-06-01')
    const shorter = await sign({ sid: 'cloud', plan: 'hosted', features: ['hosted'] }, '2026-12-01')
    const base = { db, serverUrl: 'https://klonk.test', verify, apiKey: 'k' }
    const stored = async () => (await db.select().from(instanceSettings).where(eq(instanceSettings.key, 'license')))[0]?.value

    expect(await syncPlatformInstanceLicense({ ...base, ...server({ '/api/v1/platform/instance-license': { token: selfHosted } }) })).toBe(false)
    expect(await stored()).toBeUndefined()

    const { fetch, calls } = server({ '/api/v1/platform/instance-license': { token: hosted } })
    expect(await syncPlatformInstanceLicense({ ...base, fetch })).toBe(true)
    expect(new Headers(calls[0]!.init!.headers).get('authorization')).toBe('Bearer k')
    expect(await stored()).toBe(hosted)

    expect(await syncPlatformInstanceLicense({ ...base, ...server({ '/api/v1/platform/instance-license': { token: shorter } }) })).toBe(false)
    expect(await stored()).toBe(hosted)

    // Shop ohne Endpunkt
    expect(await syncPlatformInstanceLicense({ ...base, ...server({}) })).toBe(false)
  })
})
