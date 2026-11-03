// Lernstand einer Gruppe (Gruppenleitung bzw. Admins der Organisation)
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  return groupLearnProgress(user, getRouterParam(event, 'id')!)
})
