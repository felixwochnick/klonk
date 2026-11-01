import { eq } from 'drizzle-orm'
import { z } from 'zod'

// Lizenz-Token der Instanz hinterlegen oder entfernen (nur Plattform-Admins)
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { platformAdmin: true })
  const { token } = await readValidated(event, z.object({ token: z.string().trim().max(10_000).nullable() }))

  if ((await getInstanceLicenseToken()).source === 'env')
    throw createError({ statusCode: 409, message: 'license_from_env' })

  if (token) await assertValidToken(token)

  const table = schema.instanceSettings
  await withUserDb(user.id, async (tx) => {
    if (!token) return tx.delete(table).where(eq(table.key, 'license'))
    await tx.insert(table).values({ key: 'license', value: token })
      .onConflictDoUpdate({ target: table.key, set: { value: token, updatedAt: new Date() } })
  })

  clearLicenseCache()
  return getInstanceLicense()
})
