import { eq } from 'drizzle-orm'
import { organizationAuthSettings } from '../../../database/schema'

// Rückkehr vom Identity-Provider: Claims prüfen, Konto anlegen/aktualisieren, Session starten
export default defineEventHandler(async (event) => {
  const state = readOidcState(event)
  if (!state) return sendRedirect(event, '/login?error=sso_failed')

  const [settings] = await useSystemDb().select().from(organizationAuthSettings)
    .where(eq(organizationAuthSettings.organizationId, state.organizationId))
  const oidc = settings?.oidcEnabled ? settings.oidc : null
  if (!oidc) return sendRedirect(event, '/login?error=sso_failed')

  try {
    const claims = await finishOidcLogin(event, oidc, state)
    const username = String(claims[oidc.usernameClaim] ?? claims.preferred_username ?? claims.email ?? '')

    const user = await provisionExternalUser({
      organizationId: state.organizationId,
      provider: `oidc:${state.organizationId}`,
      providerAccountId: String(claims.sub),
      username,
      displayName: String(claims.name ?? username),
      email: typeof claims.email === 'string' ? claims.email : null,
      role: oidc.roleClaim ? mapRole(claimValues(claims[oidc.roleClaim]), oidc.teacherValues, oidc.adminValues) : undefined,
    })
    if (!user) return sendRedirect(event, '/login?error=sso_failed')

    await startUserSession(event, user)
    return sendRedirect(event, state.redirect)
  }
  catch (error) {
    console.error('[klonk] OIDC-Anmeldung fehlgeschlagen', error)
    return sendRedirect(event, '/login?error=sso_failed')
  }
})
