// Solange die Instanz nicht eingerichtet ist, führt jede Seite zum Einrichtungsassistenten
export default defineNuxtRouteMiddleware(async (to) => {
  const setupDone = useState('setup-done', () => false)

  if (!setupDone.value) {
    const status = await $fetch('/api/setup')
    setupDone.value = status.setupDone
  }

  if (!setupDone.value && to.path !== '/setup') return navigateTo('/setup')
  if (setupDone.value && to.path === '/setup') return navigateTo('/')
})
