import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

// AES-256-GCM für Secrets in der Datenbank (OIDC-Client-Secret, LDAP-Bind-Passwort)

function key() {
  const { encryptionKey } = useRuntimeConfig()
  if (!encryptionKey) throw new Error('NUXT_ENCRYPTION_KEY ist nicht gesetzt')
  // Beliebige Schlüssellänge auf 32 Byte normalisieren
  return createHash('sha256').update(encryptionKey).digest()
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':')
}

export function decryptSecret(value: string) {
  const [version, iv, tag, data] = value.split(':')
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unbekanntes Secret-Format')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}
