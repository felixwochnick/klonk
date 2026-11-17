// Testziele: `dev` = eigene Dev-Server (Standard), `stack` = lokaler Komplett-Stack unter *.klonk.localhost (pnpm stack:up)
export const STACK = process.env.KLONK_E2E_TARGET === 'stack'

/**
 * Ports der eigenen Dev-Server. `KLONK_E2E_PORT_OFFSET` verschiebt alle (zusammen mit `KLONK_E2E_DATABASE`), damit
 * mehrere Arbeitskopien (Worktrees) gleichzeitig testen können, ohne sich Server oder Datenbank zu teilen.
 */
const OFFSET = Number(process.env.KLONK_E2E_PORT_OFFSET ?? 0)
export const E2E_PORTS = { app: 3010 + OFFSET, admin: 3012 + OFFSET, auth: 3013 + OFFSET, llm: 3014 + OFFSET }

export const APP_URL = STACK ? 'https://app.klonk.localhost' : `http://localhost:${E2E_PORTS.app}`
export const ADMIN_URL = STACK ? 'https://admin.klonk.localhost' : `http://localhost:${E2E_PORTS.admin}`
export const AUTH_URL = STACK ? 'https://auth.klonk.localhost' : `http://localhost:${E2E_PORTS.auth}`

// Test-Anmeldedienste – aus Sicht der Klonk-Server (im Stack über das Docker-Netz bzw. den Proxy)
export const LDAP_URL = STACK ? 'ldap://glauth:3893' : 'ldap://localhost:3893'
export const OIDC_ISSUER = STACK ? 'https://sso.klonk.localhost/dex' : 'http://localhost:5556/dex'

/** Läuft der Test-IdP? Im Stack ist er immer dabei. */
export async function testIdpAvailable() {
  if (STACK) return true
  const res = await fetch(`${OIDC_ISSUER}/.well-known/openid-configuration`).catch(() => null)
  return !!res?.ok
}
