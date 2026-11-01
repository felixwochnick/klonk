// Testziele: `dev` = eigene Dev-Server (Standard), `stack` = lokaler Komplett-Stack unter *.klonk.localhost (pnpm stack:up)
export const STACK = process.env.KLONK_E2E_TARGET === 'stack'

export const APP_URL = STACK ? 'https://app.klonk.localhost' : 'http://localhost:3010'
export const ADMIN_URL = STACK ? 'https://admin.klonk.localhost' : 'http://localhost:3012'
export const AUTH_URL = STACK ? 'https://auth.klonk.localhost' : 'http://localhost:3013'

// Test-Anmeldedienste – aus Sicht der Klonk-Server (im Stack über das Docker-Netz bzw. den Proxy)
export const LDAP_URL = STACK ? 'ldap://glauth:3893' : 'ldap://localhost:3893'
export const OIDC_ISSUER = STACK ? 'https://sso.klonk.localhost/dex' : 'http://localhost:5556/dex'

/** Läuft der Test-IdP? Im Stack ist er immer dabei. */
export async function testIdpAvailable() {
  if (STACK) return true
  const res = await fetch(`${OIDC_ISSUER}/.well-known/openid-configuration`).catch(() => null)
  return !!res?.ok
}
