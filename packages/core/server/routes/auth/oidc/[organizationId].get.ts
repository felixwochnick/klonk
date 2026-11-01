import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { organizationAuthSettings } from '../../../database/schema'

// Startet die SSO-Anmeldung einer Organisation
export default defineEventHandler(async (event) => {
  const { organizationId } = await getValidatedRouterParams(event, z.object({ organizationId: z.union([z.uuid(), z.literal('platform')]) }).parse)
  const { redirect } = await getValidatedQuery(event, z.object({ redirect: z.string().optional() }).parse)
  const safeRedirect = safeRedirectTarget(redirect, allowedOriginsFor(event))

  if (organizationId === 'platform') {
    const platform = platformOidcSettings()
    if (!platform) throw createError({ statusCode: 404, message: 'not_found' })
    const url = await startOidcLogin(event, 'platform', platform, safeRedirect)
    return sendRedirect(event, url.href)
  }

  const [settings] = await useSystemDb().select().from(organizationAuthSettings)
    .where(eq(organizationAuthSettings.organizationId, organizationId))
  if (!settings?.oidcEnabled || !settings.oidc) throw createError({ statusCode: 404, message: 'not_found' })
  await requireFeature(organizationId, 'oidc')

  const url = await startOidcLogin(event, organizationId, withDecryptedSecret(settings.oidc), safeRedirect)
  return sendRedirect(event, url.href)
})
