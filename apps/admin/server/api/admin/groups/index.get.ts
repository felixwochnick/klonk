import { and, asc, eq, isNull, sql } from 'drizzle-orm'

// Gruppen der Organisation (Lehrkräfte und Admins sehen alle, verwalten Leitung und Admins) – Untergruppen (Teams)
// verwaltet die Leitung der Klasse in der App (Unterricht), hier zählen sie nur mit
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
    subgroups: sql<number>`(select count(*)::int from ${groups} s where s.parent_id = ${groups.id})`,
    canManage: sql<boolean>`klonk.can_manage_group(${groups.id})`,
  }).from(groups).where(and(eq(groups.organizationId, organizationId), isNull(groups.parentId))).orderBy(asc(groups.name)))
})
