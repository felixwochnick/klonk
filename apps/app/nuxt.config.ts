export default defineNuxtConfig({
  extends: ['@klonk/ui', '@klonk/core'],

  modules: ['@nuxt/eslint'],

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
})
