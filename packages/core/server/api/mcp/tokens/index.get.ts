// Eigene persönliche Tokens und verbundene KI-Assistenten
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  return listMcpTokens(user)
})
