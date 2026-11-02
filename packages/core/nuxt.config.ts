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
    // Lizenz-Token der Instanz (alternativ in der Verwaltung hinterlegen)
    licenseToken: '',
    // Klonk ID: plattformweiter OIDC-Anbieter (Authentik), nur für Betreiber (Entwickler:innen, Besitzer:innen)
    platformOidc: {
      name: 'Klonk ID',
      issuer: '',
      clientId: '',
      clientSecret: '',
      scopes: 'openid profile email',
      groupsClaim: 'groups',
      // Kommagetrennte Gruppen für die Plattformrollen
      ownerGroups: 'klonk-owners',
      developerGroups: 'klonk-developers',
    },
    public: {
      // Öffentliche URLs von app.* und admin.* (für Links zwischen den Apps und OIDC-Redirect-URIs)
      appUrl: 'http://localhost:3000',
      adminUrl: 'http://localhost:3002',
      // Zentrale Anmeldung (auth.klonk.*). Leer = jede App nutzt ihre eingebaute Login-Seite
      authUrl: '',
      // Weitere Origins (kommagetrennt), die die Anmeldung nutzen dürfen – z. B. die Website klonk.*
      websiteUrls: '',
      // Shop/Kundenkonto auf klonk.* für „Lizenz kaufen/verwalten“ (leer = Link ausblenden)
      shopUrl: '',
      // Dokumentation (docs.klonk.*) für Links aus der App
      docsUrl: 'http://localhost:3001',
    },
    // KI-Assistent: Standard der Instanz für Organisationen ohne eigene Einstellung und für Privatkonten
    // (NUXT_AI_MODE = server | webllm | off; leer + NUXT_AI_BASE_URL gesetzt ⇒ server)
    ai: {
      mode: '',
      // OpenAI-kompatibler Endpunkt, z. B. `https://api.openai.com/v1` oder `http://ollama:11434/v1`
      baseUrl: '',
      model: '',
      apiKey: '',
      webllmModel: '',
      // `full` = auch Lernende bekommen volle Hilfe, sonst nur Hinweise
      students: 'tutor',
    },
    // Lokaler Testmodus (alles frei auf localhost/*.localhost); `off` schaltet ihn ab
    licenseLocalMode: 'on',
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
