import { fileURLToPath } from 'node:url'

// Gemeinsamer Design-Layer für alle Klonk-Apps (Nuxt UI, Theme, Sprachen, Basis-Komponenten)
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxtjs/i18n'],

  css: [fileURLToPath(new URL('./app/assets/css/main.css', import.meta.url))],

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
