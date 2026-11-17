import { describe, expect, it, vi } from 'vitest'
import { mcpAccessFromScope, mcpAllows, mcpGrantsUpTo, mcpMin } from '../shared/utils/mcp'

// Nuxt-Auto-Imports, die die Module beim Laden erwarten
vi.stubGlobal('useSystemDb', () => {
  throw new Error('nicht im Unit-Test')
})

const { isAllowedRedirectUri, hashToken } = await import('../server/utils/mcp-auth')

describe('MCP-Stufen', () => {
  it('wirksam ist die niedrigere Stufe aus Zugang und Konto', () => {
    expect(mcpMin('full', 'read')).toBe('read')
    expect(mcpMin('write', 'none')).toBe('none')
    expect(mcpAllows('write', 'read')).toBe(true)
    expect(mcpAllows('write', 'full')).toBe(false)
    expect(mcpGrantsUpTo('write')).toEqual(['read', 'write'])
    expect(mcpGrantsUpTo('none')).toEqual([])
  })

  it('liest die höchste Stufe aus dem OAuth-Scope', () => {
    expect(mcpAccessFromScope('mcp:read mcp:write')).toBe('write')
    expect(mcpAccessFromScope('openid mcp:full')).toBe('full')
    expect(mcpAccessFromScope('openid profile')).toBeNull()
    expect(mcpAccessFromScope(undefined)).toBeNull()
  })
})

describe('OAuth: Rücksprung-Adressen', () => {
  it('erlaubt HTTPS, lokale HTTP-Adressen und App-Schemata', () => {
    expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true)
    expect(isAllowedRedirectUri('http://localhost:6274/oauth/callback')).toBe(true)
    expect(isAllowedRedirectUri('http://127.0.0.1:33418/')).toBe(true)
    expect(isAllowedRedirectUri('cursor://anysphere.cursor-mcp/oauth/callback')).toBe(true)
  })

  it('verbietet unverschlüsseltes HTTP im Netz, Skript-Schemata und Fragmente', () => {
    expect(isAllowedRedirectUri('http://evil.example/cb')).toBe(false)
    expect(isAllowedRedirectUri('javascript:alert(1)')).toBe(false)
    expect(isAllowedRedirectUri('data:text/html,hi')).toBe(false)
    expect(isAllowedRedirectUri('https://example.com/cb#frag')).toBe(false)
    expect(isAllowedRedirectUri('kein url')).toBe(false)
  })

  it('speichert Tokens nur als Hash', () => {
    expect(hashToken('klonk_pat_x')).toMatch(/^[\w-]{43}$/)
    expect(hashToken('klonk_pat_x')).not.toBe(hashToken('klonk_pat_y'))
  })
})
