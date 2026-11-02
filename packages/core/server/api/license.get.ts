// Wirksame Lizenz des angemeldeten Kontos – die Apps blenden damit Bezahlfunktionen aus
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  return getEffectiveLicense(user.organizationId, event, user.id)
})
