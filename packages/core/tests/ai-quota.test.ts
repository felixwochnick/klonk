import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { aiCreditGrants, aiUsage, instanceSettings, organizations, users } from '../server/database/schema'
import { createDb, type Db } from '../server/utils/db'

// Nuxt-Auto-Imports, die die Module zur Laufzeit erwarten
let db: Db
for (const [name, value] of Object.entries(await import('../shared/utils/ai'))) vi.stubGlobal(name, value)
vi.stubGlobal('useSystemDb', () => db)
const { aiQuota, recordAiUsage } = await import('../server/utils/ai')
const { syncPlatformAi } = await import('../server/utils/ai-sync')

const baseUrl = process.env.KLONK_TEST_DATABASE_URL ?? 'postgres://klonk:klonk@localhost:5432/klonk'
const testDbName = 'klonk_ai_quota_test'
const testUrl = baseUrl.replace(/\/[^/]+$/, `/${testDbName}`)
const ids: Record<string, string> = {}

beforeAll(async () => {
  const admin = postgres(baseUrl, { max: 1, onnotice: () => {} })
  await admin.unsafe(`drop database if exists ${testDbName} with (force)`)
  await admin.unsafe(`create database ${testDbName}`)
  await admin.end()
  const client = postgres(testUrl, { max: 1, onnotice: () => {} })
  await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL('../server/database/migrations', import.meta.url)) })
  await client.end()

  db = createDb(testUrl)
  const [org] = await db.insert(organizations).values({ type: 'school', name: 'Schule', domain: 'quota.test' }).returning()
  const rows = await db.insert(users).values([
    { organizationId: org!.id, username: 'kim', displayName: 'Kim', role: 'member' },
    { organizationId: null, email: 'privat@quota.test', displayName: 'Privat' },
  ]).returning()
  ids.org = org!.id
  ids.student = rows[0]!.id
  ids.private = rows[1]!.id
})

afterAll(async () => {
  await (db?.$client as postgres.Sql | undefined)?.end()
})

const platform = (millicredits: number) => ({
  platform: true,
  price: { inputCredits: 1000, outputCredits: 0 },
  modelId: 'klonk-mini',
  account: { organizationId: ids.org!, userId: ids.student!, monthlyCredits: 2 },
  usage: { input: millicredits, output: 0 },
})

describe('Klonk-KI: Kontingent', () => {
  it('verbraucht erst das Monatskontingent, dann nachgekaufte Credits', async () => {
    const account = platform(0).account
    expect(await aiQuota(account)).toMatchObject({ monthly: 2000, remaining: 2000 })

    // 1 Token kostet hier 1 Tausendstel-Credit (1000 Credits je 1 Mio. Tokens)
    const call = (tokens: number) => {
      const { usage, ...config } = platform(tokens)
      return recordAiUsage(config as never, { input: usage.input, output: 0 })
    }
    await call(1500)
    expect(await aiQuota(account)).toMatchObject({ monthlyUsed: 1500, monthlyLeft: 500, remaining: 500 })

    // Überzogen ⇒ Rest geht auf nachgekaufte Credits (die es noch nicht gibt) ⇒ nichts mehr übrig
    await call(1000)
    expect(await aiQuota(account)).toMatchObject({ monthlyLeft: 0, extraUsed: 0, remaining: 0 })

    // Nachkauf: 5 Credits, der folgende Verbrauch geht davon ab
    await db.insert(aiCreditGrants).values({ id: 'bestellung-1', organizationId: ids.org!, credits: 5 })
    expect((await aiQuota(account)).remaining).toBe(5000)
    await call(2000)
    expect(await aiQuota(account)).toMatchObject({ extraUsed: 2000, extraLeft: 3000, remaining: 3000 })

    // Abgelaufene Käufe zählen nicht
    await db.insert(aiCreditGrants).values({ id: 'alt', organizationId: ids.org!, credits: 100, validUntil: new Date('2020-01-01') })
    expect((await aiQuota(account)).remaining).toBe(3000)
  })

  it('eigener Schlüssel kostet keine Credits, Verbrauch wird trotzdem gezählt', async () => {
    const before = await aiQuota(platform(0).account)
    await recordAiUsage({ platform: false, price: null, modelId: 'llama', account: platform(0).account } as never, { input: 500, output: 20 })
    expect(await aiQuota(platform(0).account)).toEqual(before)
    const [row] = await db.select().from(aiUsage).where(sql`${aiUsage.model} = 'llama'`)
    expect(row).toMatchObject({ source: 'server', inputTokens: 500, outputTokens: 20, millicredits: 0 })
  })
})

describe('Klonk-KI: Abgleich mit klonk.*', () => {
  it('übernimmt Modelle und Credits, meldet den Verbrauch', async () => {
    const calls: { path: string, body?: unknown }[] = []
    const fetch = (async (url: URL, init?: RequestInit) => {
      calls.push({ path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer platform-key')
      if (url.pathname === '/api/v1/platform/ai') {
        return Response.json({
          models: [{ id: 'klonk-mini', label: 'Klonk Mini', provider: 'openai', model: 'gpt-5-mini', inputCredits: 30, outputCredits: 240 }],
          grants: [
            { id: 'bestellung-2', organizationId: ids.org, credits: 1000, validUntil: '2099-01-01T00:00:00Z' },
            { id: 'privat-1', userId: ids.private, credits: 50 },
            // Unbekannte Organisation und Konto einer Organisation werden ignoriert
            { id: 'fremd', organizationId: '00000000-0000-4000-8000-000000000000', credits: 999 },
            { id: 'kein-privatkonto', userId: ids.student, credits: 999 },
          ],
        })
      }
      return new Response(null, { status: 204 })
    }) as typeof globalThis.fetch

    const result = await syncPlatformAi({ db, serverUrl: 'https://klonk.example', apiKey: 'platform-key', fetch })
    expect(result).toMatchObject({ models: 1, grants: 2 })

    const [models] = await db.select().from(instanceSettings).where(sql`${instanceSettings.key} = 'ai_models'`)
    expect((models!.value as { id: string }[])[0]!.id).toBe('klonk-mini')
    const grants = await db.select({ id: aiCreditGrants.id }).from(aiCreditGrants)
    expect(grants.map(g => g.id).sort()).toEqual(['alt', 'bestellung-1', 'bestellung-2', 'privat-1'])

    const report = calls.find(c => c.path === '/api/v1/platform/ai/usage')!.body as { usage: { organizationId: string, credits: number, requests: number }[] }
    expect(report.usage).toEqual([expect.objectContaining({ organizationId: ids.org, userId: null, credits: 4.5, requests: 3, inputTokens: 4500 })])

    // Wiederholbar: gleiche Bestellung wird aktualisiert, nicht doppelt gezählt
    await syncPlatformAi({ db, serverUrl: 'https://klonk.example', apiKey: 'platform-key', fetch })
    expect(await db.select().from(aiCreditGrants)).toHaveLength(4)
  })
})
