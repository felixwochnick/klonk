import { fileURLToPath } from 'node:url'

// Gemeinsamer Design-Layer für alle Klonk-Apps (Nuxt UI, Theme, Sprachen, Basis-Komponenten)
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxtjs/i18n'],

  // Logo/Favicon: scripts/gen-icons.ts erzeugt die Dateien in public/ aus assets/brand/
  app: {
    head: {
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
      meta: [{ name: 'theme-color', content: '#c91a09' }],
    },
  },

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

  // Alle verwendeten Symbole ins Client-Bundle (offline/PWA, keine Nachladeanfragen an /api/_nuxt_icon)
  icon: {
    clientBundle: {
      scan: { globInclude: ['**/*.{vue,ts}'], globExclude: ['node_modules', 'dist', '.nuxt', '.output', 'e2e', 'tests'] },
      sizeLimitKb: 512,
    },
  },
})
