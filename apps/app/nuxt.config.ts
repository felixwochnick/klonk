import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
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

/**
 * Version eines Asset-Ordners aus Dateinamen, Größen und Änderungszeiten. Die Laufzeiten liegen unter
 * `/<name>/<version>/` – ein neuer Build ergibt neue URLs, Browser- und PWA-Cache (CacheFirst, 30 Tage)
 * liefern also nie veraltete Dateien (z. B. einen alten C#-Host).
 */
function assetVersion(dir: string) {
  const hash = createHash('sha256')
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name)
      const stat = statSync(path)
      if (stat.isDirectory()) walk(path)
      else hash.update(`${path.slice(dir.length)}:${stat.size}:${stat.mtimeMs}\n`)
    }
  }
  if (existsSync(dir)) walk(dir)
  return hash.digest('hex').slice(0, 10)
}
const ASSETS = {
  pyodide: `/pyodide/${assetVersion(PYODIDE_DIR)}/`,
  teavm: `/teavm/${assetVersion(TEAVM_DIR)}/`,
  pylibs: `/pylibs/${assetVersion(PYLIBS_DIR)}/`,
  dotnet: `/dotnet/${assetVersion(DOTNET_DIR)}/`,
}

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
    '/designs': { ssr: false },
  },

  compatibilityDate: '2026-10-01',

  nitro: {
    publicAssets: [
      { dir: PYODIDE_DIR, baseURL: ASSETS.pyodide, maxAge: 60 * 60 * 24 * 365 },
      { dir: TEAVM_DIR, baseURL: ASSETS.teavm, maxAge: 60 * 60 * 24 * 365 },
      { dir: PYLIBS_DIR, baseURL: ASSETS.pylibs, maxAge: 60 * 60 * 24 * 365 },
      ...(existsSync(DOTNET_DIR) ? [{ dir: DOTNET_DIR, baseURL: ASSETS.dotnet, maxAge: 60 * 60 * 24 * 365 }] : []),
    ],
  },

  vite: {
    worker: { format: 'es' },
    // Versionierte Pfade der Laufzeiten für Worker und Seite (siehe ASSETS)
    define: { __KLONK_ASSETS__: JSON.stringify(ASSETS) },
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
      navigateFallbackAllowlist: [/^\/(world|projects|settings|designs)?\/?$/],
      runtimeCaching: [
        // Symbole, die nicht im Client-Bundle stecken
        { urlPattern: /\/api\/_nuxt_icon\//, handler: 'StaleWhileRevalidate', options: { cacheName: 'icons' } },
        { urlPattern: /\/pyodide\//, handler: 'CacheFirst', options: { cacheName: 'pyodide', expiration: { maxEntries: 400 } } },
        { urlPattern: /\/teavm\//, handler: 'CacheFirst', options: { cacheName: 'teavm', expiration: { maxEntries: 400 } } },
        { urlPattern: /\/pylibs\//, handler: 'CacheFirst', options: { cacheName: 'pylibs', expiration: { maxEntries: 400 } } },
        { urlPattern: /\/dotnet\//, handler: 'CacheFirst', options: { cacheName: 'dotnet', expiration: { maxEntries: 400 } } },
      ],
      cleanupOutdatedCaches: true,
    },
    client: { installPrompt: true },
    devOptions: { enabled: false },
  },
})
