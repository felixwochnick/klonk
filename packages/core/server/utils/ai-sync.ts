import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { aiCreditGrants, aiUsage, instanceSettings, organizations, users } from '../database/schema'
import type { Db } from './db'

/**
 * Klonk-KI der gehosteten Plattform mit klonk.* abgleichen (privates Repo klonk-web):
 * - `GET  /api/v1/platform/ai`        Modell-Liste mit Preisen und nachgekaufte Credits (Bestellungen)
 * - `POST /api/v1/platform/ai/usage`  Verbrauch je Organisation/Privatkonto und Monat (Summen, keine Inhalte)
 * Abrechnung und Preise liegen nur auf klonk.*; hier wird nur gezählt und begrenzt.
 */
/** Einstellung, in der die Modell-Liste der Klonk-KI liegt */
export const AI_MODELS_KEY = 'ai_models'

export type AiSyncDeps = { db: Db, serverUrl: string, apiKey: string, fetch?: typeof globalThis.fetch }

const platformAiSchema = z.object({
  models: z.array(z.object({
    id: z.string().min(1).max(100),
    label: z.string().min(1).max(200),
    provider: z.string().min(1).max(100),
    model: z.string().min(1).max(200),
    inputCredits: z.number().nonnegative(),
    outputCredits: z.number().nonnegative(),
    premium: z.boolean().optional(),
  })).max(200),
  grants: z.array(z.object({
    id: z.string().min(1).max(200),
    organizationId: z.uuid().nullable().optional(),
    userId: z.uuid().nullable().optional(),
    credits: z.number().int().positive(),
    validUntil: z.iso.datetime({ offset: true }).nullable().optional(),
  })).max(10_000),
})

export async function syncPlatformAi(deps: AiSyncDeps) {
  const headers = { authorization: `Bearer ${deps.apiKey}` }
  const res = await (deps.fetch ?? fetch)(new URL('/api/v1/platform/ai', deps.serverUrl), { headers })
  if (!res.ok) throw new Error(`Lizenzserver antwortet mit ${res.status}`)
  const data = platformAiSchema.parse(await res.json())

  await deps.db.insert(instanceSettings).values({ key: AI_MODELS_KEY, value: data.models })
    .onConflictDoUpdate({ target: instanceSettings.key, set: { value: data.models, updatedAt: sql`now()` } })

  // Nur Credits für vorhandene Organisationen bzw. Privatkonten übernehmen
  const orgIds = [...new Set(data.grants.map(g => g.organizationId).filter((id): id is string => !!id))]
  const userIds = [...new Set(data.grants.map(g => g.userId).filter((id): id is string => !!id))]
  const knownOrgs = new Set(orgIds.length
    ? (await deps.db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.id, orgIds))).map(o => o.id)
    : [])
  const knownUsers = new Set(userIds.length
    ? (await deps.db.select({ id: users.id }).from(users).where(and(inArray(users.id, userIds), isNull(users.organizationId)))).map(u => u.id)
    : [])

  let grants = 0
  for (const grant of data.grants) {
    const organizationId = grant.organizationId ?? null
    const userId = organizationId ? null : grant.userId ?? null
    if (organizationId ? !knownOrgs.has(organizationId) : !userId || !knownUsers.has(userId)) continue
    const values = { credits: grant.credits, validUntil: grant.validUntil ? new Date(grant.validUntil) : null }
    await deps.db.insert(aiCreditGrants).values({ id: grant.id, organizationId, userId, ...values })
      .onConflictDoUpdate({ target: aiCreditGrants.id, set: values })
    grants++
  }

  // Verbrauch des laufenden und des letzten Monats melden (der letzte kann sich nach Monatswechsel noch ändern)
  const since = sql`date_trunc('month', now()) - interval '1 month'`
  const rows = await deps.db.select({
    month: sql<string>`to_char(date_trunc('month', ${aiUsage.createdAt}), 'YYYY-MM')`,
    organizationId: aiUsage.organizationId,
    userId: sql<string | null>`case when ${aiUsage.organizationId} is null then ${aiUsage.userId} end`,
    credits: sql<string>`sum(${aiUsage.millicredits})`,
    requests: sql<number>`count(*)::int`,
    inputTokens: sql<string>`sum(${aiUsage.inputTokens})`,
    outputTokens: sql<string>`sum(${aiUsage.outputTokens})`,
  }).from(aiUsage)
    .where(and(eq(aiUsage.source, 'platform'), gte(aiUsage.createdAt, since)))
    .groupBy(sql`1`, aiUsage.organizationId, sql`3`)
  if (rows.length) {
    const usage = rows.map(r => ({
      month: r.month,
      organizationId: r.organizationId,
      userId: r.userId,
      credits: Number(r.credits) / 1000,
      requests: r.requests,
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
    }))
    const report = await (deps.fetch ?? fetch)(new URL('/api/v1/platform/ai/usage', deps.serverUrl), {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ usage }),
    })
    if (!report.ok) throw new Error(`Verbrauch nicht gemeldet: ${report.status}`)
  }

  return { models: data.models.length, grants, reported: rows.length }
}
