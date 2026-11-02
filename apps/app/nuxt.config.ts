import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Python: Pyodide-Dateien von der eigenen Origin ausliefern (COEP erlaubt keine Fremd-Ressourcen)
const PYODIDE_DIR = dirname(createRequire(import.meta.url).resolve('pyodide/package.json'))
// Java: teavm-javac (Compiler + Klassenbibliotheken) aus @klonk/runtime
const TEAVM_DIR = fileURLToPath(new URL('../../packages/runtime/teavm', import.meta.url))
// Python im Editor: Jedi + Parso (Vorschläge/Erklärungen im Sprachdienst-Worker)
const PYLIBS_DIR = fileURLToPath(new URL('../../packages/runtime/pylibs', import.meta.url))
// C#: Roslyn auf .NET-WebAssembly, gebaut mit `node scripts/build-csharp.ts` (nicht im Git)
const DOTNET_DIR = fileURLToPath(new URL('../../packages/runtime/dotnet', import.meta.url))
if (!existsSync(DOTNET_DIR)) console.warn('[klonk] C#-Host fehlt – `node scripts/build-csharp.ts` ausführen (C# sonst nicht verfügbar)')

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
    '/settings': { ssr: false },
  },

  compatibilityDate: '2026-10-01',

  nitro: {
    publicAssets: [
      { dir: PYODIDE_DIR, baseURL: '/pyodide', maxAge: 60 * 60 * 24 * 30 },
      { dir: TEAVM_DIR, baseURL: '/teavm', maxAge: 60 * 60 * 24 * 30 },
      { dir: PYLIBS_DIR, baseURL: '/pylibs', maxAge: 60 * 60 * 24 * 30 },
      ...(existsSync(DOTNET_DIR) ? [{ dir: DOTNET_DIR, baseURL: '/dotnet', maxAge: 60 * 60 * 24 * 30 }] : []),
    ],
  },

  vite: {
    worker: { format: 'es' },
    // Abhängigkeiten von Worker/Editor vorab optimieren – sonst lädt die Entwicklungsumgebung beim
    // ersten JS-Lauf neu, weil Vite sie erst dann entdeckt
    optimizeDeps: {
      include: [
        '@klonk/runtime > sucrase',
        '@klonk/runtime > acorn',
        '@klonk/runtime > magic-string',
        '@klonk/runtime > java-parser',
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
      // Pyodide (~13 MB) erst bei Bedarf, dann dauerhaft im Cache
      globIgnores: ['**/_payload.json', 'models-preview.png', 'pyodide/**', 'teavm/**', 'pylibs/**', 'dotnet/**'],
      // Monaco, three.js und Blockly sind groß
      maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
      // Alle Lern-Seiten teilen sich dieselbe SPA-Shell
      additionalManifestEntries: [{ url: '/', revision: SHELL_REVISION }],
      navigateFallback: '/',
      navigateFallbackAllowlist: [/^\/(world|projects|settings)?\/?$/],
      runtimeCaching: [
        // Symbole, die nicht im Client-Bundle stecken
        { urlPattern: /\/api\/_nuxt_icon\//, handler: 'StaleWhileRevalidate', options: { cacheName: 'icons' } },
        { urlPattern: /\/pyodide\//, handler: 'CacheFirst', options: { cacheName: 'pyodide' } },
        { urlPattern: /\/teavm\//, handler: 'CacheFirst', options: { cacheName: 'teavm' } },
        { urlPattern: /\/pylibs\//, handler: 'CacheFirst', options: { cacheName: 'pylibs' } },
        { urlPattern: /\/dotnet\//, handler: 'CacheFirst', options: { cacheName: 'dotnet' } },
      ],
      cleanupOutdatedCaches: true,
    },
    client: { installPrompt: true },
    devOptions: { enabled: false },
  },
})
