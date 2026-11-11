import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

type ImportStatus = 'created' | 'username_taken' | 'user_limit_reached' | 'failed'

/**
 * Mehrere Konten auf einmal anlegen (Import aus CSV/Excel/ODS – die Datei liest die Verwaltung im Browser).
 * Jede Zeile einzeln: bestehende Benutzernamen werden übersprungen, nicht der ganze Import. Gruppen per Name;
 * fehlende legt `createGroups` an (Jahrgangsstufe aus dem Namen geraten, z. B. „5a“ ⇒ 5).
 */
export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)
  const input = await readValidated(event, z.object({
    users: z.array(z.object({
      username: usernameSchema,
      displayName: z.string().trim().min(1).max(200),
      role: roleSchema,
      password: passwordSchema,
      groups: z.array(groupNameSchema).max(20).default([]),
    })).min(1).max(200),
    createGroups: z.boolean().default(false),
  }))

  // Gruppen auflösen bzw. anlegen
  const names = [...new Set(input.users.flatMap(u => u.groups))]
  const groupIds = new Map<string, string>()
  const createdGroups: string[] = []
  if (names.length) {
    await withUserDb(user.id, async (tx) => {
      const [org] = await tx.select({ schoolForm: schema.organizations.schoolForm }).from(schema.organizations)
        .where(eq(schema.organizations.id, organizationId))
      const rows = await tx.select({ id: schema.groups.id, name: schema.groups.name }).from(schema.groups)
        .where(and(eq(schema.groups.organizationId, organizationId), inArray(schema.groups.name, names)))
      for (const row of rows) groupIds.set(row.name, row.id)
      if (!input.createGroups) return
      const levels = schoolLevels(org?.schoolForm)
      for (const name of names.filter(n => !groupIds.has(n))) {
        groupIds.set(name, await insertGroup(tx, organizationId, name, levelFromGroupName(name, levels)))
        createdGroups.push(name)
      }
    })
  }

  const results: { username: string, status: ImportStatus }[] = []
  for (const row of input.users) {
    try {
      await assertUserCapacity(organizationId, event)
      const passwordHash = await hashPassword(row.password)
      await withUserDb(user.id, async (tx) => {
        const [created] = await tx.insert(schema.users).values({
          organizationId,
          username: row.username,
          displayName: row.displayName,
          role: row.role,
          passwordHash,
          mustChangePassword: true,
        }).returning({ id: schema.users.id }).catch(e => rethrowUnique(e, 'username_taken'))
        const memberships = row.groups.map(name => groupIds.get(name)).filter((id): id is string => !!id)
        if (memberships.length) {
          await tx.insert(schema.groupMembers)
            .values(memberships.map(groupId => ({ groupId, userId: created!.id, role: row.role === 'member' ? 'member' as const : 'leader' as const })))
            .onConflictDoNothing()
        }
      })
      results.push({ username: row.username, status: 'created' })
    }
    catch (error) {
      const message = (error as { message?: string }).message
      results.push({ username: row.username, status: message === 'username_taken' || message === 'user_limit_reached' ? message : 'failed' })
      if (message !== 'username_taken' && message !== 'user_limit_reached') console.error('[import]', error)
    }
  }
  return { results, createdGroups, missingGroups: names.filter(n => !groupIds.has(n)) }
})
