// Gruppe mit Mitgliedern
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { roles: ['teacher', 'admin'] })
  return getGroup(user, getRouterParam(event, 'id')!)
})
