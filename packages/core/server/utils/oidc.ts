import type { H3Event } from 'h3'
import * as client from 'openid-client'
import type { OidcSettings } from '../database/schema'

const STATE_COOKIE = 'klonk-oidc'
const STATE_MAX_AGE = 10 * 60

/** Organisation oder `platform` (Klonk ID / Betreiber-Login) */
export type OidcState = {
  organizationId: string
  codeVerifier: string
  state: string
  nonce: string
  redirect: string
  expiresAt: number
}

/** OIDC-Konfiguration mit Klartext-Secret (Organisationen speichern es verschlüsselt) */
export type OidcClientSettings = Omit<OidcSettings, 'clientSecret'> & { clientSecretPlain: string }

export function withDecryptedSecret(settings: OidcSettings): OidcClientSettings {
  return { ...settings, clientSecretPlain: decryptSecret(settings.clientSecret) }
}

export async function discoverOidc(settings: OidcClientSettings) {
  const issuer = new URL(settings.issuer)
  return client.discovery(issuer, settings.clientId, settings.clientSecretPlain, undefined, {
    // Nur in der Entwicklung (z. B. Dex auf http://localhost) unverschlüsselte Issuer erlauben
    execute: import.meta.dev && issuer.protocol === 'http:' ? [client.allowInsecureRequests] : [],
  })
}

/** Öffentliche Basis-URL der aktuellen App (berücksichtigt Reverse-Proxys) */
export function requestOrigin(event: H3Event) {
  return getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
}

export function oidcCallbackUrl(event: H3Event) {
  return `${requestOrigin(event)}/auth/oidc/callback`
}

/** Startet den Authorization-Code-Flow mit PKCE; Zustand liegt verschlüsselt im Cookie */
export async function startOidcLogin(event: H3Event, organizationId: string, settings: OidcClientSettings, redirect: string) {
  const config = await discoverOidc(settings)
  const state: OidcState = {
    organizationId,
    codeVerifier: client.randomPKCECodeVerifier(),
    state: client.randomState(),
    nonce: client.randomNonce(),
    redirect,
    expiresAt: Date.now() + STATE_MAX_AGE * 1000,
  }

  setCookie(event, STATE_COOKIE, encryptSecret(JSON.stringify(state)), {
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'lax',
    path: '/auth/oidc',
    maxAge: STATE_MAX_AGE,
  })

  return client.buildAuthorizationUrl(config, {
    redirect_uri: oidcCallbackUrl(event),
    scope: settings.scopes || 'openid profile email',
    code_challenge: await client.calculatePKCECodeChallenge(state.codeVerifier),
    code_challenge_method: 'S256',
    state: state.state,
    nonce: state.nonce,
  })
}

export function readOidcState(event: H3Event): OidcState | null {
  const raw = getCookie(event, STATE_COOKIE)
  deleteCookie(event, STATE_COOKIE, { path: '/auth/oidc' })
  if (!raw) return null
  try {
    const state = JSON.parse(decryptSecret(raw)) as OidcState
    return state.expiresAt > Date.now() ? state : null
  }
  catch {
    return null
  }
}

/** Tauscht den Code gegen Tokens und liefert die geprüften Claims */
export async function finishOidcLogin(event: H3Event, settings: OidcClientSettings, state: OidcState) {
  const config = await discoverOidc(settings)
  const currentUrl = new URL(oidcCallbackUrl(event))
  currentUrl.search = getRequestURL(event).search

  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: state.codeVerifier,
    expectedState: state.state,
    expectedNonce: state.nonce,
    idTokenExpected: true,
  })

  const claims: Record<string, unknown> = { ...tokens.claims() }
  // Manche Anbieter liefern Name/Gruppen nur über den UserInfo-Endpunkt
  if ((settings.roleClaim && !(settings.roleClaim in claims)) || !claims[settings.usernameClaim]) {
    const info = await client.fetchUserInfo(config, tokens.access_token, tokens.claims()!.sub)
    Object.assign(claims, info)
  }
  return claims
}

export function claimValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') return value.split(/[\s,]+/).filter(Boolean)
  return []
}
