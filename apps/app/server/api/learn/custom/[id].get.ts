// Eigenes Lernmodul mit allen Daten (Lehrkräfte der Organisation, Lernende mit Freigabe)
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  return getCustomModule(user, getRouterParam(event, 'id')!)
})
