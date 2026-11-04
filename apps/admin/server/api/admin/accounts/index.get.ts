import { desc, eq, isNull, sql } from 'drizzle-orm'

// Betreiber:innen: Privatkonten (ohne Organisation) mit Anmeldeanbietern, Betreiberrolle und Privat-Lizenz
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { platformAdmin: true })
  const { users, accounts, userLicenses } = schema

  const rows = await withUserDb(user.id, tx => tx
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      platformRole: users.platformRole,
      disabled: users.disabled,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      providers: sql<string[]>`coalesce(array_agg(distinct ${accounts.provider}) filter (where ${accounts.provider} is not null), '{}')`,
      licenseToken: userLicenses.token,
    })
    .from(users)
    .leftJoin(accounts, eq(accounts.userId, users.id))
    .leftJoin(userLicenses, eq(userLicenses.userId, users.id))
    .where(isNull(users.organizationId))
    .groupBy(users.id, userLicenses.token)
    .orderBy(desc(users.createdAt))
    .limit(500))

  const hosted = hasFeature(await getInstanceLicense(), 'hosted')
  return Promise.all(rows.map(async ({ licenseToken, ...row }) => {
    // Gehostete Plattform: Betreiber:innen haben Pro + KI (siehe getEffectiveLicense)
    if (hosted && row.platformRole !== 'user') return { ...row, plan: OPERATOR_LICENSE.plan }
    const license = licenseToken ? await verifyForInstance(licenseToken) : null
    return { ...row, plan: license && license.problem !== 'invalid' && license.problem !== 'expired' ? license.plan : null }
  }))
})
