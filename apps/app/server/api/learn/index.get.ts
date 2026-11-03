// Lernmodule: startbare Module, eigene Modulprojekte mit Lernstand, geleitete Gruppen
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  return learnStatus(user, event)
})
