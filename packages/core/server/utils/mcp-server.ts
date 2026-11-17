import type { H3Event } from 'h3'
import type { z, ZodRawShape } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import coreEn from '../../i18n/locales/en.json'

/**
 * MCP-Server von app.* und admin.* (Streamable HTTP, zustandslos, JSON-Antworten). Jede App definiert ihre Werkzeuge mit
 * {@link defineMcpTool}; angeboten wird nur, was Stufe (Token ∧ Konto) und Kontorolle erlauben. Die Werkzeuge rufen
 * dieselben Funktionen wie die REST-API auf – RLS gilt also genauso.
 */
export type McpToolContext = { event: H3Event, user: SessionUser, access: McpAccess, isPlatformAdmin: boolean }

export type KlonkMcpTool<S extends ZodRawShape = ZodRawShape> = {
  name: string
  title: string
  /** Beschreibung für das Sprachmodell (englisch) */
  description: string
  /** Benötigte Stufe: `read` = nur lesen, `write` = ändern, `full` = löschen/Passwörter */
  access: McpGrant
  /** Nur für diese Kontorollen (Betreiber:innen immer); ohne Angabe alle */
  roles?: MemberRole[]
  /** Nur für Betreiber:innen (Plattform-Admins) */
  platformAdmin?: boolean
  /** Wiederholter Aufruf mit gleichen Werten ändert nichts weiter */
  idempotent?: boolean
  input: S
  handler: (input: z.infer<z.ZodObject<S>>, ctx: McpToolContext) => Promise<unknown>
}

export function defineMcpTool<S extends ZodRawShape>(tool: KlonkMcpTool<S>): KlonkMcpTool {
  return tool as unknown as KlonkMcpTool
}

export type KlonkMcpServer = {
  name: string
  title: string
  /** Hinweise für das Sprachmodell: Begriffe, typische Abläufe */
  instructions: string
  tools: KlonkMcpTool[]
  /** Fehlertexte der App (`errors.<code>`, englisch) zusätzlich zu denen des Core-Layers */
  errors?: Record<string, string>
}

/** vue-i18n-Maskierungen (`{'@'}`) in Klartext */
const plain = (text: string) => text.replace(/\{'(.)'\}/g, '$1')

/** Fehler als Text für das Modell: Code + Erklärung aus den Übersetzungen */
function errorText(error: unknown, errors: Record<string, string>) {
  const e = error as { statusCode?: number, message?: string, statusMessage?: string }
  const code = e?.message || e?.statusMessage || 'unknown'
  const known = errors[code] ?? (coreEn.errors as Record<string, string>)[code]
  return known ? `${code}: ${plain(known)}` : `${code}${e?.statusCode ? ` (HTTP ${e.statusCode})` : ''}`
}

/** Werkzeuge, die dieses Konto mit dieser Stufe nutzen darf */
export function availableMcpTools(tools: KlonkMcpTool[], user: SessionUser, access: McpAccess) {
  const isPlatformAdmin = user.platformRole !== 'user'
  return tools.filter(t => mcpAllows(access, t.access)
    && (!t.platformAdmin || isPlatformAdmin)
    && (!t.roles || isPlatformAdmin || t.roles.includes(user.role)))
}

export async function handleMcpRequest(event: H3Event, server: KlonkMcpServer) {
  if (mcpCors(event)) return null
  // Im Browser geöffnet ⇒ Einstellungen mit Anleitung und Tokens
  if (event.method === 'GET' && getRequestHeader(event, 'accept')?.includes('text/html')) return sendRedirect(event, '/settings#mcp')
  // Zustandslos: keine Server-Ereignisse per GET, keine Sitzungen zum Beenden
  if (event.method !== 'POST') {
    setResponseHeader(event, 'allow', 'POST, OPTIONS')
    setResponseStatus(event, 405)
    return { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }
  }

  const auth = await authenticateMcp(event)
  if (!auth) {
    const hasToken = !!getRequestHeader(event, 'authorization')
    setResponseHeader(event, 'www-authenticate', `Bearer resource_metadata="${requestOrigin(event)}/.well-known/oauth-protected-resource/mcp"${hasToken ? ', error="invalid_token"' : ''}`)
    setResponseStatus(event, 401)
    return { error: hasToken ? 'invalid_token' : 'unauthorized', error_description: 'Klonk MCP needs an access token (OAuth or personal token from the settings).' }
  }

  const ctx: McpToolContext = { event, user: auth.user, access: auth.access, isPlatformAdmin: auth.user.platformRole !== 'user' }
  const mcp = new McpServer({ name: server.name, title: server.title, version: '1.0.0' }, { instructions: server.instructions, capabilities: { tools: {} } })
  for (const tool of availableMcpTools(server.tools, auth.user, auth.access)) {
    mcp.registerTool(tool.name, {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.input,
      annotations: {
        title: tool.title,
        readOnlyHint: tool.access === 'read',
        destructiveHint: tool.access === 'full',
        idempotentHint: tool.access === 'read' || !!tool.idempotent,
        openWorldHint: false,
      },
    }, async (input: Record<string, unknown>) => {
      try {
        const result = await tool.handler(input as never, ctx)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { ok: true }, null, 2) }] }
      }
      catch (error) {
        return { isError: true, content: [{ type: 'text' as const, text: errorText(error, server.errors ?? {}) }] }
      }
    })
  }

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await mcp.connect(transport)
  return transport.handleRequest(toWebRequest(event))
}

/** Gemeinsames Werkzeug beider Server: wer bin ich, was darf dieser Zugang? */
export const whoamiTool = defineMcpTool({
  name: 'get_account',
  title: 'Account and access',
  description: 'Returns the signed-in Klonk account (name, role, organization) and the MCP access level of this connection: read = read-only, write = may change data, full = may also delete and set passwords. Call this first if unsure what you may do.',
  access: 'read',
  input: {},
  handler: async (_input, { user, access }) => ({
    displayName: user.displayName,
    username: user.username && user.domain ? `${user.username}@${user.domain}` : user.username,
    role: user.role,
    platformRole: user.platformRole,
    organization: user.organizationId ? { id: user.organizationId, name: user.organizationName, type: user.organizationType } : null,
    mcpAccess: access,
  }),
})
