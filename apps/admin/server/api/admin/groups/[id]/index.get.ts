import { asc, eq, sql } from 'drizzle-orm'

// Gruppe mit Mitgliedern
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { roles: ['teacher', 'admin'] })
  const id = getRouterParam(event, 'id')!
  const { groups, groupMembers, users } = schema
  return withUserDb(user.id, async (tx) => {
    const [group] = await tx.select({
      id: groups.id,
      name: groups.name,
      membersCanWrite: groups.membersCanWrite,
      level: groups.level,
      canManage: sql<boolean>`klonk.can_manage_group(${groups.id})`,
    }).from(groups).where(eq(groups.id, id))
    if (!group) throw createError({ statusCode: 404, message: 'group_not_found' })
    const members = await tx.select({
      userId: users.id,
      displayName: users.displayName,
      username: users.username,
      accountRole: users.role,
      role: groupMembers.role,
    }).from(groupMembers).innerJoin(users, eq(users.id, groupMembers.userId))
      .where(eq(groupMembers.groupId, id)).orderBy(asc(groupMembers.role), asc(users.displayName))
    return { ...group, members }
  })
})
