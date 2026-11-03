// Klonk Cloud: eigene Projekte, Gruppen mit gemeinsamem Ordner und Aufgaben, Kontingent
export default defineEventHandler(async (event): Promise<CloudStatus> => {
  const { user } = await requireAuth(event)
  return cloudStatus(user, event)
})
