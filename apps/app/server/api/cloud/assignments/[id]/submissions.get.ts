// Abgaben einer Aufgabe für die Gruppenleitung
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  return assignmentSubmissions(user, getRouterParam(event, 'id')!)
})
