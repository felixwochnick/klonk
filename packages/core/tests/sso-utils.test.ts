import { describe, expect, it, vi } from 'vitest'

// Nuxt-Auto-Imports, die die Module beim Laden erwarten
vi.stubGlobal('useSystemDb', () => {
  throw new Error('nicht im Unit-Test')
})
vi.stubGlobal('decryptSecret', (v: string) => v)

const { escapeLdapFilter } = await import('../server/utils/ldap')
const { mapRole, normalizeUsername } = await import('../server/utils/provision')

describe('escapeLdapFilter', () => {
  it('maskiert Sonderzeichen nach RFC 4515', () => {
    expect(escapeLdapFilter('*')).toBe('\\2a')
    expect(escapeLdapFilter('a)(uid=*')).toBe('a\\29\\28uid=\\2a')
    expect(escapeLdapFilter('back\\slash')).toBe('back\\5cslash')
    expect(escapeLdapFilter('nul\0')).toBe('nul\\00')
    expect(escapeLdapFilter('max.mustermann')).toBe('max.mustermann')
  })
})

describe('normalizeUsername', () => {
  it('nimmt den lokalen Teil von E-Mail-Adressen', () => {
    expect(normalizeUsername('Max.Muster@schule.de')).toBe('max.muster')
  })

  it('wandelt Umlaute um und entfernt unerlaubte Zeichen', () => {
    expect(normalizeUsername(' Jörg Müller ')).toBe('joergmueller')
    expect(normalizeUsername('Renée')).toBe('renee')
    expect(normalizeUsername('')).toBe('')
  })
})

describe('mapRole', () => {
  it('liefert undefined ohne konfigurierte Zuordnung', () => {
    expect(mapRole(['teachers'])).toBeUndefined()
  })

  it('Admin hat Vorrang vor Lehrkraft, sonst Mitglied', () => {
    expect(mapRole(['teachers', 'admins'], ['teachers'], ['admins'])).toBe('admin')
    expect(mapRole(['Teachers'], ['teachers'], ['admins'])).toBe('teacher')
    expect(mapRole(['students'], ['teachers'], ['admins'])).toBe('member')
  })
})
