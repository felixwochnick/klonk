// Alle Seiten erfordern eine Anmeldung, außer sie setzen `definePageMeta({ public: true })`.
// Mit zentraler Anmeldung (auth.klonk.*) wird dorthin weitergeleitet.
export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn, user } = useUserSession()
  const { isCentral, loginUrl, changePasswordUrl } = useAuthUrls()

  // Apps mit Einrichtungsassistent (admin): solange nicht eingerichtet, führt jede Seite dorthin
  const setupRoute = useAppConfig().klonk?.setupRoute
  if (setupRoute) {
    const setupDone = useState('setup-done', () => false)
    if (!setupDone.value) setupDone.value = (await $fetch('/api/setup')).setupDone
    if (!setupDone.value) return to.path === setupRoute ? undefined : navigateTo(setupRoute)
    if (to.path === setupRoute) return navigateTo('/')
  }

  // Eingebaute Login-Seiten sind bei zentraler Anmeldung nur Weiterleitungen
  if (isCentral && (to.path === '/login' || to.path === '/change-password')) {
    const redirect = typeof to.query.redirect === 'string' && to.query.redirect.startsWith('/') ? to.query.redirect : '/'
    if (to.path === '/change-password') return navigateTo(changePasswordUrl(redirect), { external: true })
    return loggedIn.value ? navigateTo(redirect) : navigateTo(loginUrl(redirect), { external: true })
  }

  if (to.meta.public) return

  if (!loggedIn.value) return navigateTo(loginUrl(to.fullPath), { external: isCentral })

  if (user.value?.mustChangePassword && to.path !== '/change-password')
    return navigateTo(changePasswordUrl(to.fullPath), { external: isCentral })
})
