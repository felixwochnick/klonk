export function useAuth() {
  const session = useUserSession()
  const { loginUrl } = useAuthUrls()

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    await session.fetch()
    // Session ist in der DB gelöscht ⇒ überall abgemeldet; zurück zur (ggf. zentralen) Anmeldung
    await navigateTo(loginUrl('/'), { external: true })
  }

  /** Lädt Rollen/Daten neu aus der DB (z. B. nach Änderungen durch Admins) */
  async function refresh() {
    await $fetch('/api/auth/me').catch(() => {})
    await session.fetch()
  }

  const isPlatformAdmin = computed(() => !!session.user.value && session.user.value.platformRole !== 'user')

  return { ...session, logout, refresh, isPlatformAdmin }
}
