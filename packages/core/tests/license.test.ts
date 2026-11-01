import { readFileSync } from 'node:fs'
import { importPKCS8, SignJWT } from 'jose'
import { describe, expect, it, vi } from 'vitest'

// Nuxt-Auto-Imports, die das Modul beim Laden erwartet
const shared = await import('../shared/utils/license')
for (const [name, value] of Object.entries(shared)) vi.stubGlobal(name, value)
vi.stubGlobal('useSystemDb', () => {
  throw new Error('nicht im Unit-Test')
})

const { verifyLicenseToken } = await import('../server/utils/license')

const devKey = await importPKCS8(readFileSync(new URL('./fixtures/dev-license-key.pem', import.meta.url), 'utf8'), 'EdDSA')
const now = new Date('2026-06-01T00:00:00Z')

function sign(claims: Record<string, unknown>, options: { exp?: Date, kid?: string, issuer?: string } = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'EdDSA', kid: options.kid ?? 'klonk-dev' })
    .setIssuer(options.issuer ?? 'klonk')
    .setSubject('kunde-1')
    .setExpirationTime(options.exp ?? new Date('2027-01-01T00:00:00Z'))
    .sign(devKey)
}

const dev = { allowDevKeys: true, now }

describe('verifyLicenseToken', () => {
  it('liest Plan, Grenzen und Funktionen aus einem gültigen Token', async () => {
    const token = await sign({ name: 'Gymnasium', plan: 'school', maxUsers: 500, features: ['oidc', 'ai', 'unbekannt'] })
    expect(await verifyLicenseToken(token, dev)).toEqual({
      plan: 'school',
      licensee: 'Gymnasium',
      maxUsers: 500,
      features: ['oidc', 'ai'],
      expiresAt: '2027-01-01T00:00:00.000Z',
      problem: null,
    })
  })

  it('ohne maxUsers ist die Nutzerzahl unbegrenzt', async () => {
    expect((await verifyLicenseToken(await sign({ features: [] }), dev)).maxUsers).toBeNull()
  })

  it('Testschlüssel gelten nicht in Produktions-Builds', async () => {
    const result = await verifyLicenseToken(await sign({ features: ['oidc'] }), { now })
    expect(result).toMatchObject({ plan: 'free', maxUsers: 10, features: [], problem: 'invalid' })
  })

  it('manipulierte Tokens sind ungültig', async () => {
    const token = await sign({ features: ['oidc'], maxUsers: 5 })
    const [header, , signature] = token.split('.')
    const payload = Buffer.from(JSON.stringify({ iss: 'klonk', features: ['oidc'], maxUsers: null })).toString('base64url')
    expect((await verifyLicenseToken(`${header}.${payload}.${signature}`, dev)).problem).toBe('invalid')
  })

  it('falscher Aussteller oder unbekannter Schlüssel sind ungültig', async () => {
    expect((await verifyLicenseToken(await sign({}, { issuer: 'fremd' }), dev)).problem).toBe('invalid')
    expect((await verifyLicenseToken(await sign({}, { kid: 'gibt-es-nicht' }), dev)).problem).toBe('invalid')
    expect((await verifyLicenseToken('kein.jwt', dev)).problem).toBe('invalid')
  })

  it('nach Ablauf gilt eine Kulanzzeit von 14 Tagen, danach die kostenlose Version', async () => {
    const token = await sign({ features: ['oidc'] }, { exp: new Date('2026-05-25T00:00:00Z') })
    expect(await verifyLicenseToken(token, dev)).toMatchObject({ features: ['oidc'], problem: 'grace' })

    const expired = await sign({ features: ['oidc'] }, { exp: new Date('2026-05-01T00:00:00Z') })
    expect(await verifyLicenseToken(expired, dev)).toMatchObject({ plan: 'free', features: [], problem: 'expired' })
  })

  it('Domainbindung: gilt für die Domain und ihre Subdomains', async () => {
    const token = await sign({ features: ['oidc'], domains: ['klonk.example'] })
    expect((await verifyLicenseToken(token, { ...dev, host: 'app.klonk.example' })).problem).toBeNull()
    expect((await verifyLicenseToken(token, { ...dev, host: 'klonk.example' })).problem).toBeNull()
    expect((await verifyLicenseToken(token, { ...dev, host: 'app.andere.example' })).problem).toBe('wrong_domain')
    expect((await verifyLicenseToken(token, { ...dev, host: 'evilklonk.example' })).problem).toBe('wrong_domain')
  })
})
