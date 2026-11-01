// Jeder Build bekommt eine neue Revision für die vorab gespeicherte App-Shell
const SHELL_REVISION = Date.now().toString(36)

export default defineNuxtConfig({
  extends: ['@klonk/ui', '@klonk/core'],

  modules: ['@nuxt/eslint', '@vite-pwa/nuxt'],

  devtools: { enabled: true },

  // JS/TS laufen synchron im Worker und werden über SharedArrayBuffer gesteuert ⇒ Cross-Origin-Isolation.
  // Alle Ressourcen kommen von der eigenen Origin (Modelle, Monaco, Schriften, Icons).
  routeRules: {
    '/**': {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
    // Lern-Seiten als SPA-Shell ohne Nutzerdaten ⇒ der Service Worker kann sie für offline speichern
    '/': { ssr: false },
    '/world': { ssr: false },
    '/projects': { ssr: false },
  },

  compatibilityDate: '2026-10-01',

  vite: {
    worker: { format: 'es' },
    // Abhängigkeiten von Worker/Editor vorab optimieren – sonst lädt die Entwicklungsumgebung beim
    // ersten JS-Lauf neu, weil Vite sie erst dann entdeckt
    optimizeDeps: {
      include: [
        '@klonk/runtime > sucrase',
        '@klonk/runtime > acorn',
        '@klonk/runtime > magic-string',
        '@klonk/klonk-script > zod',
        'monaco-editor',
        'three',
        'blockly/core',
        'blockly/blocks',
        'blockly/msg/de',
        'blockly/msg/en',
      ],
    },
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
  },

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

  // PWA: installierbar, App-Shell + alle Assets (Editor, 3D-Modelle, Blockly) offline verfügbar.
  // Anmelden geht nur online; danach merkt sich die App den Nutzer (plugins/offline-session.client.ts).
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Klonk',
      short_name: 'Klonk',
      description: 'Programmieren lernen mit Klemmbaustein-Figuren',
      lang: 'de',
      theme_color: '#c91a09',
      background_color: '#ffffff',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,mjs,css,wasm,glb,png,svg,ico,woff2,json}'],
      globIgnores: ['**/_payload.json', 'models-preview.png'],
      // Monaco, three.js und Blockly sind groß
      maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
      // Alle Lern-Seiten teilen sich dieselbe SPA-Shell
      additionalManifestEntries: [{ url: '/', revision: SHELL_REVISION }],
      navigateFallback: '/',
      navigateFallbackAllowlist: [/^\/(world|projects)?\/?$/],
      runtimeCaching: [
        // Symbole, die nicht im Client-Bundle stecken
        { urlPattern: /\/api\/_nuxt_icon\//, handler: 'StaleWhileRevalidate', options: { cacheName: 'icons' } },
      ],
      cleanupOutdatedCaches: true,
    },
    client: { installPrompt: true },
    devOptions: { enabled: false },
  },
})
