// Stellt ein Lizenz-Token aus – bis der Shop auf klonk.* das übernimmt.
//
//   node scripts/sign-license.ts --name "Gymnasium Musterstadt" --plan self-hosted \
//     --features oidc,characters,models,libraries,ai --days 365 [--max-users 500] [--domains klonk.example] [--key <pem>] [--kid klonk-2026-1]
//
// Selbsthost-Pläne: `self-hosted` (Standard: bis 1000 Konten) und `self-hosted-enterprise` (Standard: unbegrenzt).
// --max-users überschreibt die Grenze des Plans, `--max-users unlimited` = unbegrenzt.
// Gehostete Plattform: --ai-credits 2000 = monatliche Credits der Klonk-KI (1 Credit ≈ 1 Cent API-Kosten).
//
// Standardschlüssel: ~/.config/klonk/license-signing-key.pem (privat, niemals ins Repo!)
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { importPKCS8, SignJWT } from 'jose'

const { values } = parseArgs({
  options: {
    'name': { type: 'string' },
    'customer': { type: 'string' },
    'plan': { type: 'string', default: 'self-hosted' },
    'max-users': { type: 'string' },
    'features': { type: 'string', default: '' },
    'days': { type: 'string', default: '365' },
    'domains': { type: 'string' },
    'ai-credits': { type: 'string' },
    'key': { type: 'string', default: join(homedir(), '.config/klonk/license-signing-key.pem') },
    'kid': { type: 'string', default: 'klonk-2026-1' },
  },
})

if (!values.name) {
  console.error('--name fehlt')
  process.exit(1)
}

// Standardgrenzen der Selbsthost-Pläne (siehe packages/core/shared/utils/license.ts)
const PLAN_DEFAULT_MAX_USERS: Record<string, number | null> = { 'self-hosted': 1000, 'self-hosted-enterprise': null }

function maxUsers() {
  const value = values['max-users']
  if (value === 'unlimited') return null
  if (value) return Number(value)
  return PLAN_DEFAULT_MAX_USERS[values.plan] ?? null
}

const key = await importPKCS8(readFileSync(values.key, 'utf8'), 'EdDSA')
const token = await new SignJWT({
  name: values.name,
  plan: values.plan,
  maxUsers: maxUsers(),
  features: values.features.split(',').map(s => s.trim()).filter(Boolean),
  ...(values['ai-credits'] ? { aiCredits: Number(values['ai-credits']) } : {}),
  ...(values.domains ? { domains: values.domains.split(',').map(s => s.trim()) } : {}),
})
  .setProtectedHeader({ alg: 'EdDSA', kid: values.kid })
  .setIssuer('klonk')
  .setSubject(values.customer ?? values.name)
  .setIssuedAt()
  .setExpirationTime(`${Number(values.days)}d`)
  .sign(key)

console.log(token)
