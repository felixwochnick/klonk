// Untergruppe anlegen: Name, Art der Zusammenarbeit, Mitglieder aus der Klasse, Startdateien des gemeinsamen Ordners
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const input = await readValidated(event, createSubgroupSchema)
  return createSubgroup(user, getRouterParam(event, 'id')!, input)
})
