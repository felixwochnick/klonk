// Unterricht: Schule (Lehrplan je Jahrgangsstufe) und geleitete Gruppen mit Stufe und freigegebenen Modulen
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  return teachingOverview(user)
})
