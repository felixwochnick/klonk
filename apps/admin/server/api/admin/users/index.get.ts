import { and, asc, eq } from 'drizzle-orm'

// Konten der Organisation – die Sichtbarkeit begrenzt zusätzlich RLS
export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['teacher', 'admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)
  const { users } = schema

  return withUserDb(user.id, tx => tx
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      disabled: users.disabled,
      hasPassword: users.passwordHash,
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.organizationId, organizationId)))
    .orderBy(asc(users.username)),
  ).then(rows => rows.map(({ hasPassword, ...row }) => ({ ...row, hasPassword: !!hasPassword })))
})
