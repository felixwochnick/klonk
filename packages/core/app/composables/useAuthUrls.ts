/** URLs der zentralen Anmeldung (auth.klonk.*) bzw. der eingebauten Login-Seite */
export function useAuthUrls() {
  const config = useRuntimeConfig().public
  const appConfig = useAppConfig()
  const requestUrl = useRequestURL()

  /** Diese App leitet zur zentralen Anmeldung weiter (statt eigener Login-Seite) */
  const isCentral = !!config.authUrl && !appConfig.klonk?.authServer
  const allowedOrigins = [...allowedRedirectOrigins(config), requestUrl.origin]

  function absolute(path: string) {
    return new URL(path, requestUrl.origin).href
  }

  function loginUrl(returnTo: string) {
    if (!isCentral) return { path: '/login', query: returnTo !== '/' ? { redirect: returnTo } : undefined }
    return `${config.authUrl}/login?redirect=${encodeURIComponent(absolute(returnTo))}`
  }

  function changePasswordUrl(returnTo = '/') {
    if (!isCentral) return { path: '/change-password', query: returnTo !== '/' ? { redirect: returnTo } : undefined }
    return `${config.authUrl}/change-password?redirect=${encodeURIComponent(absolute(returnTo))}`
  }

  /** OIDC-Redirect-URIs, die Schulen bei ihrem Identity-Provider eintragen */
  const oidcCallbackUrls = config.authUrl
    ? [`${config.authUrl}/auth/oidc/callback`]
    : [...new Set([config.appUrl, config.adminUrl])].map(url => `${url}/auth/oidc/callback`)

  return { isCentral, allowedOrigins, loginUrl, changePasswordUrl, oidcCallbackUrls }
}
