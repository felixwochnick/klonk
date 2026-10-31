export default defineNuxtConfig({
  extends: ['docus'],

  modules: ['@nuxtjs/i18n'],

  site: {
    name: 'Klonk Docs',
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
