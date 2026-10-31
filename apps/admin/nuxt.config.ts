// admin.klonk.* – Verwaltung von Organisationen, Login-Methoden und Konten
export default defineNuxtConfig({
  extends: ['@klonk/ui', '@klonk/core'],

  modules: ['@nuxt/eslint'],

  devtools: { enabled: true },

  compatibilityDate: '2026-10-01',

  eslint: {
    config: {
      stylistic: true,
    },
  },

  i18n: {
    locales: [
      { code: 'de', file: 'de.json' },
      { code: 'en', file: 'en.json' },
    ],
  },
})
