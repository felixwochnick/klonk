// Versionierte Pfade der großen Laufzeiten (Pyodide, teavm-javac, Jedi, .NET) – die App setzt sie per Vite-`define`
// (apps/app/nuxt.config.ts), damit neue Builds nie aus einem alten Cache geladen werden. Ohne (Tests): feste Pfade.
declare const __KLONK_ASSETS__: Record<'pyodide' | 'teavm' | 'pylibs' | 'dotnet', string> | undefined

export function assetUrl(name: 'pyodide' | 'teavm' | 'pylibs' | 'dotnet') {
  return typeof __KLONK_ASSETS__ !== 'undefined' ? __KLONK_ASSETS__[name] : `/${name}/`
}
