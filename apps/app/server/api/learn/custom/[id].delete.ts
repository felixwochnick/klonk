// Eigenes Lernmodul löschen (Autor:in, Admins) – Freigaben verschwinden, Modulprojekte der Lernenden bleiben
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  return deleteCustomModule(user, getRouterParam(event, 'id')!)
})
