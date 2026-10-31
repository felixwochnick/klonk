import { asc, count, eq } from 'drizzle-orm'

// Plattform-Admins: alle Organisationen mit Kontenzahl
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { platformAdmin: true })
  const { organizations, users } = schema

  return withUserDb(user.id, tx => tx
    .select({
      id: organizations.id,
      name: organizations.name,
      type: organizations.type,
      domain: organizations.domain,
      createdAt: organizations.createdAt,
      users: count(users.id),
    })
    .from(organizations)
    .leftJoin(users, eq(users.organizationId, organizations.id))
    .groupBy(organizations.id)
    .orderBy(asc(organizations.name)))
})
