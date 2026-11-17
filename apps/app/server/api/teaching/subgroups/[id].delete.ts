// Untergruppe löschen (mit gemeinsamem Ordner) – eigene Projekte der Mitglieder bleiben
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  return deleteSubgroup(user, getRouterParam(event, 'id')!)
})
