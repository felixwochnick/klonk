import { fileURLToPath } from 'node:url'

// Gemeinsamer Server-Layer: Datenbank (Drizzle + RLS), Migrationen, Authentifizierung
export default defineNuxtConfig({
  modules: ['nuxt-auth-utils', '@nuxtjs/i18n'],

  runtimeConfig: {
    databaseUrl: '',
    // Im Docker-Image per NUXT_MIGRATIONS_DIR überschrieben
    migrationsDir: fileURLToPath(new URL('./server/database/migrations', import.meta.url)),
    // 32 Byte (hex/base64) für die Verschlüsselung von SSO-Secrets in der DB
    encryptionKey: '',
    session: {
      name: 'klonk-session',
      maxAge: 60 * 60 * 24 * 14,
      cookie: {
        // Für gemeinsame Sessions über Subdomains, z. B. `.klonk.app`
        domain: undefined as string | undefined,
      },
    },
  },

  i18n: {
    // Ergänzt die Übersetzungen des UI-Layers um Auth-Texte
    locales: [
      { code: 'de', file: 'de.json' },
      { code: 'en', file: 'en.json' },
    ],
  },
})
