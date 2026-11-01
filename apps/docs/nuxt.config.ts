export default defineNuxtConfig({
  extends: ['docus'],

  modules: ['@nuxtjs/i18n'],

  // Öffentliche Adresse der Docs (Sitemap, OG-Bilder) – im Proxy-Image aus KLONK_DOMAIN gesetzt
  site: {
    name: 'Klonk Docs',
    url: process.env.DOCS_URL ?? 'http://localhost:3001',
  },

  // Domain steht noch nicht fest (docs.klonk.*) – per Umgebungsvariable setzen
  llms: {
    domain: process.env.DOCS_URL ?? 'http://localhost:3001',
  },

  compatibilityDate: '2026-10-01',

  i18n: {
    defaultLocale: 'de',
    locales: [
      { code: 'de', name: 'Deutsch' },
      { code: 'en', name: 'English' },
    ],
  },
})
