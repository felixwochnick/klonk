/**
 * MCP-Zugang (Model Context Protocol): KI-Assistenten wie Claude, ChatGPT oder Copilot steuern app.* und admin.* im Namen
 * eines Kontos. Die Verwaltung legt je Konto die höchste Stufe fest; jeder Zugang (Token, verbundenes Programm) hat eine
 * eigene Stufe – wirksam ist immer die niedrigere.
 */
export const MCP_ACCESS_LEVELS = ['none', 'read', 'write', 'full'] as const
export type McpAccess = typeof MCP_ACCESS_LEVELS[number]
/** Stufen, die ein Zugang haben kann */
export type McpGrant = Exclude<McpAccess, 'none'>
export const MCP_GRANTS: McpGrant[] = ['read', 'write', 'full']

const rank = (access: McpAccess) => MCP_ACCESS_LEVELS.indexOf(access)

/** Reicht `have` für `need`? */
export const mcpAllows = (have: McpAccess, need: McpAccess) => rank(have) >= rank(need)

/** Niedrigere der beiden Stufen */
export const mcpMin = (a: McpAccess, b: McpAccess): McpAccess => (rank(a) <= rank(b) ? a : b)

/** Stufen bis einschließlich `max` (Auswahl beim Anlegen eines Tokens bzw. bei der Zustimmung) */
export const mcpGrantsUpTo = (max: McpAccess) => MCP_GRANTS.filter(g => mcpAllows(max, g))

/** OAuth-Scopes: `mcp:read`, `mcp:write`, `mcp:full` */
export const MCP_SCOPES = MCP_GRANTS.map(g => `mcp:${g}`)

/** Höchste Stufe aus einem OAuth-`scope` (Leerzeichen-getrennt); ohne bekannte Scopes `null` */
export function mcpAccessFromScope(scope: string | null | undefined): McpGrant | null {
  const wanted = (scope ?? '').split(/\s+/).flatMap(s => (s.startsWith('mcp:') ? [s.slice(4)] : []))
  const grants = MCP_GRANTS.filter(g => wanted.includes(g))
  return grants.at(-1) ?? null
}

/** Laufzeiten persönlicher Tokens in Tagen */
export const MCP_TOKEN_DAYS = [30, 90, 365] as const

/** Persönliches Token bzw. verbundenes Programm (Einstellungen) */
export type McpTokenInfo = {
  id: string
  kind: 'personal' | 'oauth'
  name: string
  access: McpGrant
  expiresAt: string
  lastUsedAt: string | null
  createdAt: string
}

/** Zugangsdaten für die Einstellungen: Stufe des Kontos und Adressen der MCP-Server */
export type McpInfo = {
  access: McpAccess
  servers: { id: 'app' | 'admin', url: string }[]
}
