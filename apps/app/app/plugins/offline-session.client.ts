// Offline weiterarbeiten (PWA): zuletzt angemeldeten Nutzer merken und ohne Netz wiederverwenden.
// Nur für die Anzeige/Navigation – jede API prüft weiterhin die echte Session.
// Läuft nach dem Session-Plugin von nuxt-auth-utils (Modul-Plugins zuerst).
const OFFLINE_USER_KEY = 'klonk:offline-user'

export default defineNuxtPlugin(async () => {
  const { user, loggedIn, fetch } = useUserSession()
  const session = useState<Record<string, unknown> | null>('nuxt-session')

  if (!loggedIn.value) {
    if (await isOffline()) {
      const cached = storage(() => localStorage.getItem(OFFLINE_USER_KEY))
      if (cached) session.value = { user: JSON.parse(cached), offline: true }
    }
    else {
      // Online und nicht angemeldet (abgemeldet, Session widerrufen) ⇒ nichts mehr merken
      storage(() => localStorage.removeItem(OFFLINE_USER_KEY))
    }
  }

  watch(user, (value) => {
    if (value && !session.value?.offline) storage(() => localStorage.setItem(OFFLINE_USER_KEY, JSON.stringify(value)))
  }, { immediate: true })

  // Wieder online ⇒ echte Session laden
  window.addEventListener('online', () => {
    if (session.value?.offline) void fetch()
  })
})

/** Offline, wenn der Browser es meldet oder der Server nicht erreichbar ist */
async function isOffline() {
  if (!navigator.onLine) return true
  try {
    await $fetch('/api/health', { retry: 0, timeout: 4000 })
    return false
  }
  catch (error) {
    return !(error as { response?: unknown }).response
  }
}

function storage<T>(fn: () => T): T | undefined {
  try {
    return fn()
  }
  catch {
    return undefined
  }
}
