// Untergruppen einer Klasse mit ihren Mitgliedern (Leitung der Klasse)
export default defineEventHandler(async (event): Promise<SubgroupsOverview> => {
  const { user } = await requireAuth(event)
  return subgroupsOverview(user, getRouterParam(event, 'id')!)
})
