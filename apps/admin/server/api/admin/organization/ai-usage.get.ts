import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { z } from 'zod'

// Verbrauch des KI-Assistenten eines Monats (Summen je Modell und Konto, keine Chatinhalte)
export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)
  const { month } = await getValidatedQuery(event, z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() }).parse)

  const start = month ? new Date(`${month}-01T00:00:00Z`) : new Date(new Date().toISOString().slice(0, 7) + '-01T00:00:00Z')
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
  const usage = schema.aiUsage
  const where = and(eq(usage.organizationId, organizationId), gte(usage.createdAt, start), lt(usage.createdAt, end))
  const sums = {
    requests: sql<number>`count(*)::int`,
    inputTokens: sql<number>`coalesce(sum(${usage.inputTokens}), 0)::int`,
    outputTokens: sql<number>`coalesce(sum(${usage.outputTokens}), 0)::int`,
    credits: sql<number>`round(coalesce(sum(${usage.millicredits}), 0) / 1000.0, 2)::float`,
  }

  return withUserDb(user.id, async (tx) => {
    const [total] = await tx.select(sums).from(usage).where(where)
    const models = await tx.select({ model: usage.model, source: usage.source, ...sums }).from(usage).where(where)
      .groupBy(usage.model, usage.source).orderBy(desc(sql`count(*)`))
    const users = await tx.select({
      userId: usage.userId,
      displayName: schema.users.displayName,
      username: schema.users.username,
      role: schema.users.role,
      ...sums,
    }).from(usage).innerJoin(schema.users, eq(schema.users.id, usage.userId)).where(where)
      .groupBy(usage.userId, schema.users.displayName, schema.users.username, schema.users.role)
      .orderBy(desc(sql`sum(${usage.millicredits})`), desc(sql`count(*)`)).limit(100)
    return { month: start.toISOString().slice(0, 7), total, models, users }
  })
})
