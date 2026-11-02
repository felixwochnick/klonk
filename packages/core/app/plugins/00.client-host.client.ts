// Jede API-Anfrage über $fetch meldet den Hostnamen, unter dem die Seite im Browser läuft. Der Server schaltet den lokalen
// Testmodus nur frei, wenn dieser UND der Host der Anfrage lokal sind (siehe server/utils/license.ts).
// useFetch nutzt eine eigene Instanz ⇒ dort `clientHostHeaders()` mitgeben.
export default defineNuxtPlugin(() => {
  globalThis.$fetch = globalThis.$fetch.create({
    onRequest({ request, options }) {
      // Nur an die eigene Origin (fremde Origins müssten den Header sonst per CORS erlauben)
      const url = typeof request === 'string' ? request : request.url
      if (/^https?:\/\//.test(url) && new URL(url).origin !== location.origin) return
      const headers = new Headers(options.headers as HeadersInit | undefined)
      headers.set('x-klonk-host', location.hostname)
      options.headers = headers
    },
  })
})
