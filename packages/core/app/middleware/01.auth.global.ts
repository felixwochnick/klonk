// Alle Seiten erfordern eine Anmeldung, außer sie setzen `definePageMeta({ public: true })`
export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn, user } = useUserSession()

  if (to.meta.public) return

  if (!loggedIn.value)
    return navigateTo({ path: '/login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : undefined })

  if (user.value?.mustChangePassword && to.path !== '/change-password')
    return navigateTo('/change-password')
})
