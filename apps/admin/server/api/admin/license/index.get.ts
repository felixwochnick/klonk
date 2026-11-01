import { eq } from 'drizzle-orm'

// Lizenzübersicht für die Verwaltung: Instanz (Plattform-Admins) und ggf. Organisation (gehostete Plattform)
export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['admin'] })
  const instance = await getInstanceLicense()
  const hosted = hasFeature(instance, 'hosted')

  const result: {
    hosted: boolean
    instance: null | { license: LicenseInfo, source: 'env' | 'db', hasToken: boolean, usage: { used: number, max: number | null } }
    organization: null | { license: LicenseInfo, hasToken: boolean, usage: { used: number, max: number | null } }
  } = { hosted, instance: null, organization: null }

  if (isPlatformAdmin) {
    const { token, source } = await getInstanceLicenseToken()
    result.instance = { license: instance, source, hasToken: !!token, usage: await getUserUsage(null) }
  }

  if (hosted && user.organizationId) {
    const [org] = await withUserDb(user.id, tx => tx.select({ token: schema.organizations.licenseToken })
      .from(schema.organizations).where(eq(schema.organizations.id, user.organizationId!)))
    result.organization = {
      license: await getEffectiveLicense(user.organizationId),
      hasToken: !!org?.token,
      usage: await getUserUsage(user.organizationId),
    }
  }

  // Selbsthosting: Organisations-Admins sehen die Instanz-Lizenz (ohne Verwaltungsrechte)
  if (!hosted && !isPlatformAdmin) {
    result.organization = { license: instance, hasToken: false, usage: await getUserUsage(null) }
  }

  return result
})
