// Öffentliche Schlüssel zur Prüfung von Lizenz-Tokens (Ed25519, `kid` im JWT-Header).
// Die privaten Schlüssel liegen ausschließlich bei klonk.* – niemals in diesem Repo.
export const LICENSE_PUBLIC_KEYS: Record<string, string> = {
  'klonk-2026-2': `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAgTlnuIwNvTKtjxuqVYmWiqENc99Myk00RpKjWJRi/aI=
-----END PUBLIC KEY-----`,
}

// Nur in der Entwicklung/Tests akzeptiert (privater Testschlüssel liegt in e2e/fixtures)
export const DEV_LICENSE_PUBLIC_KEYS: Record<string, string> = {
  'klonk-dev': `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA1fHKuQRxzPvl4K2xx5LSGoxX62k1+3luw5uONLoQjj4=
-----END PUBLIC KEY-----`,
}
