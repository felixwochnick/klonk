import { z } from 'zod'

// Plattform-Admins legen eine Organisation samt erstem Admin an
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { platformAdmin: true })
  const input = await readValidated(event, z.object({
    type: z.enum(['school', 'company']),
    name: z.string().trim().min(2).max(200),
    domain: domainSchema,
    admin: z.object({
      username: usernameSchema,
      displayName: z.string().trim().min(1).max(200),
      password: passwordSchema,
    }),
  }))

  // Die neue Organisation hat noch keine eigene Lizenz – nur die Instanzgrenze prüfen
  await assertUserCapacity(null)
  const passwordHash = await hashPassword(input.admin.password)

  return withUserDb(user.id, async (tx) => {
    const [org] = await tx.insert(schema.organizations)
      .values({ type: input.type, name: input.name, domain: input.domain })
      .returning()
      .catch(e => rethrowUnique(e, 'domain_taken'))
    await tx.insert(schema.organizationAuthSettings).values({ organizationId: org!.id })
    await tx.insert(schema.users).values({
      organizationId: org!.id,
      username: input.admin.username,
      displayName: input.admin.displayName,
      role: 'admin',
      passwordHash,
      mustChangePassword: true,
    })
    return org!
  })
})
