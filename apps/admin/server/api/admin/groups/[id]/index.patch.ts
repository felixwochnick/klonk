// Name, Einordnung (Jahrgangsstufe/Zusatzkurse) und Schreibrecht im gemeinsamen Ordner (Gruppenleitung oder Admin)
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { roles: ['teacher', 'admin'] })
  return updateGroup(user, getRouterParam(event, 'id')!, await readValidated(event, groupUpdateSchema))
})
