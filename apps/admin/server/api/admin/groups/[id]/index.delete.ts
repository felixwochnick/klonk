// Gruppe samt gemeinsamem Ordner löschen (Bearbeitungen der Mitglieder bleiben in deren Cloud)
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { roles: ['teacher', 'admin'] })
  return deleteGroup(user, getRouterParam(event, 'id')!)
})
