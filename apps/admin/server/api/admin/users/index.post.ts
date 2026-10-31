import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)
  const input = await readValidated(event, z.object({
    username: usernameSchema,
    displayName: z.string().trim().min(1).max(200),
    role: roleSchema,
    password: passwordSchema,
  }))

  const passwordHash = await hashPassword(input.password)

  const [created] = await withUserDb(user.id, tx => tx.insert(schema.users).values({
    organizationId,
    username: input.username,
    displayName: input.displayName,
    role: input.role,
    passwordHash,
    // Startpasswort vergibt die Verwaltung – beim ersten Login ändern
    mustChangePassword: true,
  }).returning({ id: schema.users.id })).catch(e => rethrowUnique(e, 'username_taken'))

  return created
})
