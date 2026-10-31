import { eq } from 'drizzle-orm'
import { z } from 'zod'

const oidcSchema = z.object({
  issuer: z.url(),
  clientId: z.string().trim().min(1),
  // Leer = bisheriges Secret behalten
  clientSecret: z.string().optional(),
  scopes: z.string().trim().default('openid profile email'),
  usernameClaim: z.string().trim().default('preferred_username'),
  roleClaim: z.string().trim().optional(),
  teacherValues: z.array(z.string().trim().min(1)).optional(),
  adminValues: z.array(z.string().trim().min(1)).optional(),
})

const ldapSchema = z.object({
  url: z.string().trim().regex(/^ldaps?:\/\//),
  bindDn: z.string().trim(),
  bindPassword: z.string().optional(),
  baseDn: z.string().trim().min(1),
  userFilter: z.string().trim().includes('{{username}}'),
  usernameAttribute: z.string().trim().default('uid'),
  displayNameAttribute: z.string().trim().default('cn'),
  teacherGroups: z.array(z.string().trim().min(1)).optional(),
  adminGroups: z.array(z.string().trim().min(1)).optional(),
  startTls: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)
  const input = await readValidated(event, z.object({
    localEnabled: z.boolean(),
    oidcEnabled: z.boolean(),
    oidc: oidcSchema.nullable(),
    ldapEnabled: z.boolean(),
    ldap: ldapSchema.nullable(),
  }).refine(v => v.localEnabled || v.oidcEnabled || v.ldapEnabled, { message: 'no_login_method' })
    .refine(v => !v.oidcEnabled || v.oidc, { message: 'oidc_incomplete' })
    .refine(v => !v.ldapEnabled || v.ldap, { message: 'ldap_incomplete' }))

  const table = schema.organizationAuthSettings

  return withUserDb(user.id, async (tx) => {
    const [current] = await tx.select().from(table).where(eq(table.organizationId, organizationId))
    if (!current) throw createError({ statusCode: 404, message: 'not_found' })

    const oidc = input.oidc && {
      ...input.oidc,
      clientSecret: input.oidc.clientSecret ? encryptSecret(input.oidc.clientSecret) : (current.oidc?.clientSecret ?? ''),
    }
    const ldap = input.ldap && {
      ...input.ldap,
      bindPassword: input.ldap.bindPassword ? encryptSecret(input.ldap.bindPassword) : (current.ldap?.bindPassword ?? ''),
    }

    await tx.update(table).set({
      localEnabled: input.localEnabled,
      oidcEnabled: input.oidcEnabled,
      oidc,
      ldapEnabled: input.ldapEnabled,
      ldap,
      updatedAt: new Date(),
    }).where(eq(table.organizationId, organizationId))

    return { ok: true }
  })
})
