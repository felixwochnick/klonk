import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxtjs/i18n'],

  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    databaseUrl: '',
    // Im Docker-Image per NUXT_MIGRATIONS_DIR überschrieben
    migrationsDir: fileURLToPath(new URL('./server/database/migrations', import.meta.url)),
  },

  compatibilityDate: '2026-10-01',

  eslint: {
    config: {
      stylistic: true,
    },
  },

  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'de',
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'klonk_locale',
      fallbackLocale: 'en',
    },
  },
})
