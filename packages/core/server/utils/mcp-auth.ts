import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { mcpOauthClients, mcpOauthCodes, mcpTokens, users } from '../database/schema'

/**
 * Anmeldung der MCP-Server (app.*, admin.*): persönliche Zugriffstokens und OAuth 2.1 (Autorisierungscode + PKCE,
 * Dynamic Client Registration) für KI-Assistenten wie Claude, ChatGPT oder VS Code. Autorisierungsserver ist die
 * zentrale Anmeldung (auth.*), ohne sie jede App selbst. Gespeichert werden nur Hashes der Tokens.
 */
const ACCESS_TOKEN_SECONDS = 60 * 60
const REFRESH_DAYS = 30
const CODE_SECONDS = 10 * 60
const DAY = 24 * 60 * 60 * 1000

export const hashToken = (token: string) => createHash('sha256').update(token).digest('base64url')
const newSecret = (prefix: string) => `${prefix}_${randomBytes(32).toString('base64url')}`
const trimUrl = (url: string) => url.replace(/\/+$/, '')

/** Fehler im Format von RFC 6749 (Token-Endpunkt, Registrierung) */
export class OAuthError extends Error {
  constructor(public code: string, public description: string, public status = 400) {
    super(code)
  }
}

/** MCP-Server dieser Instanz (Adressen aus der Konfiguration) */
export function mcpServers(): McpInfo['servers'] {
  const { appUrl, adminUrl } = useRuntimeConfig().public
  return [{ id: 'app', url: `${trimUrl(appUrl)}/mcp` }, { id: 'admin', url: `${trimUrl(adminUrl)}/mcp` }]
}

/** Adresse des MCP-Servers, über die diese Anfrage kam (Reverse-Proxy beachtet) */
export const mcpResourceUrl = (event: H3Event) => `${requestOrigin(event)}/mcp`

/** Ist diese App der OAuth-Autorisierungsserver? Mit zentraler Anmeldung nur auth.*, sonst jede App selbst. */
export function isMcpAuthorizationServer() {
  return !useRuntimeConfig().public.authUrl || !!useAppConfig().klonk?.authServer
}

/** Aussteller (`issuer`) der OAuth-Metadaten – Clients prüfen ihn gegen die Adresse, von der sie die Metadaten holen */
export function mcpIssuer(event: H3Event) {
  const { authUrl } = useRuntimeConfig().public
  return authUrl ? trimUrl(authUrl) : requestOrigin(event)
}

/** RFC 8414: Metadaten des Autorisierungsservers */
export function authorizationServerMetadata(event: H3Event) {
  const issuer = mcpIssuer(event)
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: MCP_SCOPES,
    authorization_response_iss_parameter_supported: true,
  }
}

/** RFC 9728: Metadaten der geschützten Ressource (des MCP-Servers dieser App) */
export function protectedResourceMetadata(event: H3Event) {
  const { docsUrl } = useRuntimeConfig().public
  return {
    resource: mcpResourceUrl(event),
    authorization_servers: [mcpIssuer(event)],
    scopes_supported: MCP_SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: useAppConfig().klonk?.mcp === 'admin' ? 'Klonk Verwaltung' : 'Klonk',
    ...(docsUrl ? { resource_documentation: `${trimUrl(docsUrl)}/de/administration/mcp` } : {}),
  }
}

/**
 * `resource` (RFC 8707) prüfen und vereinheitlichen: nur MCP-Server auf den eigenen Adressen (app, admin, auth, Website –
 * die Hauptdomain kann die App ausliefern). Ohne Pfad ⇒ `/mcp`.
 */
export function normalizeResource(resource: string | undefined | null) {
  if (!resource) return null
  let url: URL
  try {
    url = new URL(resource)
  }
  catch {
    throw new OAuthError('invalid_target', 'resource is not a URL')
  }
  const origins = allowedRedirectOrigins(useRuntimeConfig().public).map(o => new URL(o).origin)
  if (!origins.includes(url.origin) || !['', '/', '/mcp', '/mcp/'].includes(url.pathname))
    throw new OAuthError('invalid_target', 'unknown resource')
  return `${url.origin}/mcp`
}

/** Bearer-Token einer MCP-Anfrage */
const bearerToken = (event: H3Event) => getRequestHeader(event, 'authorization')?.match(/^Bearer\s+(\S+)\s*$/i)?.[1] ?? null

export type McpAuth = { user: SessionUser, access: McpAccess, tokenId: string }

/**
 * MCP-Anfrage anmelden: Token gültig, Konto aktiv (ohne Pflicht-Passwortänderung), Zugang für diesen Server ausgestellt.
 * Wirksame Stufe = niedrigere aus Token und Konto, `null` = abgelehnt.
 */
export async function authenticateMcp(event: H3Event): Promise<McpAuth | null> {
  const token = bearerToken(event)
  if (!token) return null
  const db = useSystemDb()
  const [row] = await db.select({ token: mcpTokens, accountAccess: users.mcpAccess })
    .from(mcpTokens).innerJoin(users, eq(users.id, mcpTokens.userId))
    .where(and(
      eq(mcpTokens.tokenHash, hashToken(token)),
      gt(mcpTokens.expiresAt, sql`now()`),
      or(isNull(mcpTokens.tokenExpiresAt), gt(mcpTokens.tokenExpiresAt, sql`now()`)),
    ))
  if (!row) return null

  const own = useAppConfig().klonk?.mcp
  const ownUrls = [mcpResourceUrl(event), ...mcpServers().filter(s => s.id === own).map(s => s.url)]
  if (row.token.resource && !ownUrls.includes(row.token.resource)) return null

  const user = await loadSessionUser(row.token.userId)
  if (!user || user.mustChangePassword) return null
  const access = mcpMin(row.token.access, row.accountAccess)
  if (access === 'none') return null

  // „Zuletzt genutzt“ höchstens einmal pro Minute schreiben
  if (!row.token.lastUsedAt || Date.now() - row.token.lastUsedAt.getTime() > 60_000)
    await db.update(mcpTokens).set({ lastUsedAt: new Date() }).where(eq(mcpTokens.id, row.token.id))
  return { user, access, tokenId: row.token.id }
}

/** Stufe des Kontos (aktuell aus der Datenbank, nicht aus dem Session-Cookie) */
export async function accountMcpAccess(userId: string): Promise<McpAccess> {
  const [row] = await withUserDb(userId, tx => tx.select({ access: users.mcpAccess }).from(users).where(eq(users.id, userId)))
  return row?.access ?? 'none'
}

// --- Persönliche Tokens und verbundene Programme ------------------------------

const asInfo = (row: typeof mcpTokens.$inferSelect): McpTokenInfo => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  access: row.access as McpGrant,
  expiresAt: row.expiresAt.toISOString(),
  lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
})

/** Eigene Zugänge (abgelaufene werden dabei entfernt) */
export function listMcpTokens(user: SessionUser) {
  return withUserDb(user.id, async (tx) => {
    await tx.delete(mcpTokens).where(and(eq(mcpTokens.userId, user.id), lt(mcpTokens.expiresAt, sql`now()`)))
    const rows = await tx.select().from(mcpTokens).where(eq(mcpTokens.userId, user.id)).orderBy(mcpTokens.createdAt)
    return rows.map(asInfo)
  })
}

/** Persönliches Token anlegen – der Klartext wird nur dieses eine Mal geliefert. RLS: höchstens die Stufe des Kontos. */
export async function createPersonalToken(user: SessionUser, input: { name: string, access: McpGrant, days: number }) {
  const token = newSecret('klonk_pat')
  const [row] = await withUserDb(user.id, tx => tx.insert(mcpTokens).values({
    userId: user.id,
    kind: 'personal',
    name: input.name,
    access: input.access,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + input.days * DAY),
  }).returning()).catch(() => {
    throw createError({ statusCode: 403, message: 'mcp_access_forbidden' })
  })
  return { token, info: asInfo(row!) }
}

export async function revokeMcpToken(user: SessionUser, id: string) {
  const deleted = await withUserDb(user.id, tx => tx.delete(mcpTokens).where(and(eq(mcpTokens.id, id), eq(mcpTokens.userId, user.id))).returning({ id: mcpTokens.id }))
  if (!deleted.length) throw createError({ statusCode: 404, message: 'not_found' })
  return { ok: true }
}

// --- OAuth: Programme registrieren (RFC 7591) ----------------------------------

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]']
const FORBIDDEN_SCHEMES = ['javascript:', 'data:', 'file:', 'vbscript:', 'blob:', 'about:']

/** Redirect-URIs: HTTPS, HTTP nur lokal (Desktop-Programme), eigene Schemata von Apps (z. B. `cursor://`) */
export function isAllowedRedirectUri(value: string) {
  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    return false
  }
  if (url.hash || FORBIDDEN_SCHEMES.includes(url.protocol)) return false
  if (url.protocol === 'https:') return true
  if (url.protocol === 'http:') return LOOPBACK.includes(url.hostname)
  return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol)
}

const registrationSchema = z.object({
  redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
  client_name: z.string().trim().max(100).optional(),
  token_endpoint_auth_method: z.enum(['none', 'client_secret_post', 'client_secret_basic']).default('none'),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
}).loose()

export async function registerOAuthClient(body: unknown) {
  const parsed = registrationSchema.safeParse(body)
  if (!parsed.success) throw new OAuthError('invalid_client_metadata', parsed.error.issues[0]?.message ?? 'invalid metadata')
  const input = parsed.data
  if (!input.redirect_uris.every(isAllowedRedirectUri)) throw new OAuthError('invalid_redirect_uri', 'redirect_uris must use https, a loopback address or an app scheme')
  if (input.grant_types?.some(g => !['authorization_code', 'refresh_token'].includes(g))) throw new OAuthError('invalid_client_metadata', 'unsupported grant_types')
  if (input.response_types?.some(r => r !== 'code')) throw new OAuthError('invalid_client_metadata', 'unsupported response_types')

  const id = `klonk_client_${randomBytes(16).toString('base64url')}`
  const secret = input.token_endpoint_auth_method === 'none' ? null : newSecret('klonk_cs')
  const name = input.client_name || 'MCP'
  await useSystemDb().insert(mcpOauthClients).values({ id, name, redirectUris: input.redirect_uris, secretHash: secret && hashToken(secret) })
  return {
    client_id: id,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: name,
    redirect_uris: input.redirect_uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: input.token_endpoint_auth_method,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
  }
}

// --- OAuth: Zustimmung ----------------------------------------------------------

export const authorizeQuerySchema = z.object({
  response_type: z.string(),
  client_id: z.string().max(200),
  redirect_uri: z.string().max(2000),
  code_challenge: z.string().regex(/^[\w-]{43,128}$/),
  code_challenge_method: z.string().default('plain'),
  state: z.string().max(2000).optional(),
  scope: z.string().max(500).optional(),
  resource: z.string().max(2000).optional(),
})
export type AuthorizeQuery = z.infer<typeof authorizeQuerySchema>

/**
 * Anfrage an `/oauth/authorize` prüfen. Fehler werden auf der Seite angezeigt (nicht weitergeleitet), damit eine
 * gefälschte Anfrage niemanden auf eine fremde Adresse schickt.
 */
export async function checkAuthorizeRequest(query: unknown) {
  const parsed = authorizeQuerySchema.safeParse(query)
  if (!parsed.success) throw createError({ statusCode: 400, message: 'oauth_invalid_request' })
  const params = parsed.data
  const [client] = await useSystemDb().select().from(mcpOauthClients).where(eq(mcpOauthClients.id, params.client_id))
  if (!client) throw createError({ statusCode: 400, message: 'oauth_unknown_client' })
  if (!client.redirectUris.includes(params.redirect_uri)) throw createError({ statusCode: 400, message: 'oauth_invalid_redirect' })
  if (params.response_type !== 'code' || params.code_challenge_method !== 'S256') throw createError({ statusCode: 400, message: 'oauth_invalid_request' })
  let resource: string | null
  try {
    resource = normalizeResource(params.resource)
  }
  catch {
    throw createError({ statusCode: 400, message: 'oauth_invalid_resource' })
  }
  return { params, client, resource, requested: mcpAccessFromScope(params.scope) }
}

function redirectWith(params: AuthorizeQuery, issuer: string, values: Record<string, string>) {
  const url = new URL(params.redirect_uri)
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value)
  if (params.state !== undefined) url.searchParams.set('state', params.state)
  url.searchParams.set('iss', issuer)
  return url.href
}

/** Zustimmung: Code ausstellen und Rücksprung-Adresse liefern. `access` höchstens die Stufe des Kontos. */
export async function approveAuthorization(event: H3Event, user: SessionUser, query: unknown, access: McpGrant) {
  const { params, client, resource } = await checkAuthorizeRequest(query)
  if (!mcpAllows(await accountMcpAccess(user.id), access)) throw createError({ statusCode: 403, message: 'mcp_access_forbidden' })
  const code = newSecret('klonk_code')
  await useSystemDb().insert(mcpOauthCodes).values({
    codeHash: hashToken(code),
    clientId: client.id,
    userId: user.id,
    redirectUri: params.redirect_uri,
    codeChallenge: params.code_challenge,
    access,
    resource,
    expiresAt: new Date(Date.now() + CODE_SECONDS * 1000),
  })
  return redirectWith(params, mcpIssuer(event), { code })
}

/** Ablehnung: Rücksprung mit `access_denied` */
export async function denyAuthorization(event: H3Event, query: unknown) {
  const { params } = await checkAuthorizeRequest(query)
  return redirectWith(params, mcpIssuer(event), { error: 'access_denied' })
}

// --- OAuth: Token-Endpunkt -------------------------------------------------------

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
const pkce = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')

/** Programm am Token-Endpunkt erkennen: öffentlich (nur `client_id`) oder mit Secret (Basic bzw. im Body) */
async function authenticateClient(event: H3Event, body: Record<string, unknown>) {
  let clientId = typeof body.client_id === 'string' ? body.client_id : undefined
  let secret = typeof body.client_secret === 'string' ? body.client_secret : undefined
  const basic = getRequestHeader(event, 'authorization')?.match(/^Basic\s+(\S+)$/i)?.[1]
  if (basic) {
    const [id, pass] = Buffer.from(basic, 'base64').toString('utf8').split(':').map(decodeURIComponent)
    clientId = id
    secret = pass
  }
  if (!clientId) throw new OAuthError('invalid_client', 'client_id missing', 401)
  const [client] = await useSystemDb().select().from(mcpOauthClients).where(eq(mcpOauthClients.id, clientId))
  if (!client) throw new OAuthError('invalid_client', 'unknown client', 401)
  if (client.secretHash && (!secret || !safeEqual(hashToken(secret), client.secretHash))) throw new OAuthError('invalid_client', 'client authentication failed', 401)
  return client
}

function tokenPair() {
  const accessToken = newSecret('klonk_at')
  const refreshToken = newSecret('klonk_rt')
  return {
    accessToken,
    refreshToken,
    values: {
      tokenHash: hashToken(accessToken),
      refreshHash: hashToken(refreshToken),
      tokenExpiresAt: new Date(Date.now() + ACCESS_TOKEN_SECONDS * 1000),
      expiresAt: new Date(Date.now() + REFRESH_DAYS * DAY),
    },
  }
}

const tokenResponse = (pair: ReturnType<typeof tokenPair>, access: McpAccess) => ({
  access_token: pair.accessToken,
  token_type: 'Bearer',
  expires_in: ACCESS_TOKEN_SECONDS,
  refresh_token: pair.refreshToken,
  scope: `mcp:${access}`,
})

/** `POST /oauth/token`: Code gegen Tokens tauschen bzw. Refresh-Token einlösen (beide Tokens werden erneuert) */
export async function exchangeOAuthToken(event: H3Event) {
  const body = (await readBody(event).catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') throw new OAuthError('invalid_request', 'body missing')
  const client = await authenticateClient(event, body)
  const db = useSystemDb()
  const str = (key: string) => (typeof body[key] === 'string' ? body[key] as string : undefined)

  if (body.grant_type === 'authorization_code') {
    const code = str('code')
    const verifier = str('code_verifier')
    if (!code || !verifier) throw new OAuthError('invalid_request', 'code and code_verifier required')
    // Einmalig: Löschen und Lesen in einem Schritt
    const [grant] = await db.delete(mcpOauthCodes).where(eq(mcpOauthCodes.codeHash, hashToken(code))).returning()
    if (!grant || grant.expiresAt < new Date() || grant.clientId !== client.id) throw new OAuthError('invalid_grant', 'code invalid or expired')
    if (str('redirect_uri') !== undefined && str('redirect_uri') !== grant.redirectUri) throw new OAuthError('invalid_grant', 'redirect_uri mismatch')
    if (!safeEqual(pkce(verifier), grant.codeChallenge)) throw new OAuthError('invalid_grant', 'PKCE verification failed')
    let resource = grant.resource
    const requested = normalizeResource(str('resource'))
    if (requested && resource && requested !== resource) throw new OAuthError('invalid_target', 'resource mismatch')
    resource ??= requested

    const user = await loadSessionUser(grant.userId)
    if (!user) throw new OAuthError('invalid_grant', 'account disabled')
    const pair = tokenPair()
    await db.transaction(async (tx) => {
      // Erneutes Verbinden desselben Programms ersetzt die alte Verbindung
      await tx.delete(mcpTokens).where(and(eq(mcpTokens.userId, grant.userId), eq(mcpTokens.clientId, client.id), resource ? eq(mcpTokens.resource, resource) : isNull(mcpTokens.resource)))
      await tx.insert(mcpTokens).values({ userId: grant.userId, kind: 'oauth', name: client.name, clientId: client.id, access: grant.access, resource, ...pair.values })
    })
    return tokenResponse(pair, grant.access)
  }

  if (body.grant_type === 'refresh_token') {
    const refresh = str('refresh_token')
    if (!refresh) throw new OAuthError('invalid_request', 'refresh_token required')
    const [row] = await db.select().from(mcpTokens).where(and(eq(mcpTokens.refreshHash, hashToken(refresh)), gt(mcpTokens.expiresAt, sql`now()`)))
    if (!row || row.clientId !== client.id) throw new OAuthError('invalid_grant', 'refresh_token invalid or expired')
    if (!(await loadSessionUser(row.userId))) throw new OAuthError('invalid_grant', 'account disabled')
    const pair = tokenPair()
    const [updated] = await db.update(mcpTokens).set(pair.values).where(and(eq(mcpTokens.id, row.id), eq(mcpTokens.refreshHash, row.refreshHash!))).returning({ id: mcpTokens.id })
    if (!updated) throw new OAuthError('invalid_grant', 'refresh_token already used')
    return tokenResponse(pair, row.access)
  }

  throw new OAuthError('unsupported_grant_type', 'use authorization_code or refresh_token')
}

/** OAuth-Endpunkte antworten mit `{ error, error_description }` und ohne Cache */
export async function oauthEndpoint(event: H3Event, fn: () => Promise<unknown>, status = 200) {
  setResponseHeaders(event, { 'cache-control': 'no-store', 'pragma': 'no-cache' })
  try {
    const result = await fn()
    setResponseStatus(event, status)
    return result
  }
  catch (error) {
    if (!(error instanceof OAuthError)) throw error
    setResponseStatus(event, error.status)
    return { error: error.code, error_description: error.description }
  }
}

/**
 * CORS für MCP- und OAuth-Endpunkte (ohne Cookies – angemeldet wird per Token). Beantwortet Preflight-Anfragen;
 * `true` = Anfrage erledigt.
 */
export function mcpCors(event: H3Event) {
  setResponseHeaders(event, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id',
    'access-control-expose-headers': 'www-authenticate, mcp-session-id',
    'access-control-max-age': 86400,
  })
  if (event.method !== 'OPTIONS') return false
  setResponseStatus(event, 204)
  return true
}
