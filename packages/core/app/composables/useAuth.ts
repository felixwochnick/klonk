export function useAuth() {
  const session = useUserSession()

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    await session.fetch()
    await navigateTo('/login')
  }

  /** Lädt Rollen/Daten neu aus der DB (z. B. nach Änderungen durch Admins) */
  async function refresh() {
    await $fetch('/api/auth/me').catch(() => {})
    await session.fetch()
  }

  const isPlatformAdmin = computed(() => !!session.user.value && session.user.value.platformRole !== 'user')

  return { ...session, logout, refresh, isPlatformAdmin }
}
