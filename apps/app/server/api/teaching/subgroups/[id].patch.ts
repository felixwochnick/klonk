// Untergruppe ändern: Name, Art der Zusammenarbeit, Schreibrecht im gemeinsamen Ordner, Mitglieder
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const input = await readValidated(event, updateSubgroupSchema)
  return updateSubgroup(user, getRouterParam(event, 'id')!, input)
})
