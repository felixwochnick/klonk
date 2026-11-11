import { asc, eq, sql } from 'drizzle-orm'

// Gruppen der Organisation (Lehrkräfte und Admins sehen alle, verwalten Leitung und Admins)
export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['teacher', 'admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)
  const { groups, groupMembers } = schema
  return withUserDb(user.id, tx => tx.select({
    id: groups.id,
    name: groups.name,
    membersCanWrite: groups.membersCanWrite,
    level: groups.level,
    members: sql<number>`(select count(*)::int from ${groupMembers} where ${groupMembers.groupId} = ${groups.id})`,
    canManage: sql<boolean>`klonk.can_manage_group(${groups.id})`,
  }).from(groups).where(eq(groups.organizationId, organizationId)).orderBy(asc(groups.name)))
})
