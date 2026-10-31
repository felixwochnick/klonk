// Die Verwaltung ist nur für Lehrkräfte/Ausbildende, Admins und Plattform-Admins
export default defineNuxtRouteMiddleware((to) => {
  if (to.meta.public || to.path === '/no-access' || to.path === '/change-password') return

  const { user, isPlatformAdmin } = useAuth()
  if (!user.value) return

  const allowed = isPlatformAdmin.value || user.value.role === 'teacher' || user.value.role === 'admin'
  if (!allowed) return navigateTo('/no-access')

  if (to.meta.requiresAdmin && user.value.role !== 'admin' && !isPlatformAdmin.value) return navigateTo('/')
  if (to.meta.requiresPlatformAdmin && !isPlatformAdmin.value) return navigateTo('/')
})
