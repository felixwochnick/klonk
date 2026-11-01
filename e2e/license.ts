import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { importPKCS8, SignJWT } from 'jose'
import { STACK } from './targets'

// Dev-Server akzeptieren den Testschlüssel; der Stack (Produktions-Build) nur den echten Schlüssel,
// der lokal unter ~/.config/klonk liegt (oder KLONK_LICENSE_SIGNING_KEY) – fehlt er, werden Lizenztests übersprungen.
const keyFile = STACK
  ? process.env.KLONK_LICENSE_SIGNING_KEY ?? join(homedir(), '.config/klonk/license-signing-key.pem')
  : new URL('../packages/core/tests/fixtures/dev-license-key.pem', import.meta.url).pathname
const kid = STACK ? 'klonk-2026-1' : 'klonk-dev'

export const canSignLicense = existsSync(keyFile)

export async function signLicense(claims: { name: string, plan?: string, maxUsers?: number | null, features: string[] }) {
  const key = await importPKCS8(readFileSync(keyFile, 'utf8'), 'EdDSA')
  return new SignJWT({ plan: 'school', maxUsers: null, ...claims, ...(STACK ? { domains: ['klonk.localhost'] } : {}) })
    .setProtectedHeader({ alg: 'EdDSA', kid })
    .setIssuer('klonk')
    .setSubject('e2e')
    .setIssuedAt()
    .setExpirationTime('1d')
    .sign(key)
}
