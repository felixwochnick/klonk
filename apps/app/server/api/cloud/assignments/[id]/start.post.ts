// Aufgabe bearbeiten: eigenes Projekt als Kopie des Aufgabenordners (die Gruppenleitung sieht es als Abgabe)
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  await requireCloud(user, event)
  const project = await startAssignment(user, getRouterParam(event, 'id')!)
  return { id: project.id, name: project.name }
})
