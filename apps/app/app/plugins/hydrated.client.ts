// Markiert die Seite nach der Hydration – E2E-Tests warten darauf, bevor sie interagieren
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:suspense:resolve', () => {
    document.documentElement.dataset.hydrated = 'true'
  })
})
