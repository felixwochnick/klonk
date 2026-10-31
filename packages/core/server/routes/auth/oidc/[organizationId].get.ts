import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { organizationAuthSettings } from '../../../database/schema'

// Startet die SSO-Anmeldung einer Organisation
export default defineEventHandler(async (event) => {
  const { organizationId } = await getValidatedRouterParams(event, z.object({ organizationId: z.uuid() }).parse)
  const { redirect } = await getValidatedQuery(event, z.object({ redirect: z.string().optional() }).parse)

  const [settings] = await useSystemDb().select().from(organizationAuthSettings)
    .where(eq(organizationAuthSettings.organizationId, organizationId))
  if (!settings?.oidcEnabled || !settings.oidc) throw createError({ statusCode: 404, message: 'not_found' })

  const safeRedirect = redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : '/'
  const url = await startOidcLogin(event, organizationId, settings.oidc, safeRedirect)
  return sendRedirect(event, url.href)
})
