// Stellt ein Lizenz-Token aus – bis der Shop auf klonk.* das übernimmt.
//
//   node scripts/sign-license.ts --name "Gymnasium Musterstadt" --plan school --max-users 500 \
//     --features oidc,characters,models,libraries,ai --days 365 [--domains klonk.example] [--key <pem>] [--kid klonk-2026-1]
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
    'plan': { type: 'string', default: 'pro' },
    'max-users': { type: 'string' },
    'features': { type: 'string', default: '' },
    'days': { type: 'string', default: '365' },
    'domains': { type: 'string' },
    'key': { type: 'string', default: join(homedir(), '.config/klonk/license-signing-key.pem') },
    'kid': { type: 'string', default: 'klonk-2026-1' },
  },
})

if (!values.name) {
  console.error('--name fehlt')
  process.exit(1)
}

const key = await importPKCS8(readFileSync(values.key, 'utf8'), 'EdDSA')
const token = await new SignJWT({
  name: values.name,
  plan: values.plan,
  maxUsers: values['max-users'] ? Number(values['max-users']) : null,
  features: values.features.split(',').map(s => s.trim()).filter(Boolean),
  ...(values.domains ? { domains: values.domains.split(',').map(s => s.trim()) } : {}),
})
  .setProtectedHeader({ alg: 'EdDSA', kid: values.kid })
  .setIssuer('klonk')
  .setSubject(values.customer ?? values.name)
  .setIssuedAt()
  .setExpirationTime(`${Number(values.days)}d`)
  .sign(key)

console.log(token)
