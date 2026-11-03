// Prüft den eigenen Anbieter mit einer kurzen Anfrage an das erste Modell (mit den eingegebenen, noch ungespeicherten Werten)
export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)
  const input = await readValidated(event, aiSettingsSchema)
  if (input.mode !== 'server') throw createError({ statusCode: 400, message: 'ai_incomplete' })

  const encrypted = await withUserDb(user.id, tx => resolveAiKey(tx, organizationId, input.apiKey))
  const endpoint: AiEndpoint = {
    provider: input.provider,
    baseUrl: input.baseUrl!,
    apiKey: encrypted ? decryptSecret(encrypted) : null,
    model: input.models[0]!.id,
  }
  try {
    const response = await fetchAiChat(endpoint, 'Reply with OK.', [{ role: 'user', content: 'Reply with OK.' }], {
      stream: false,
      maxTokens: 16,
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) return { ok: false, message: `${response.status} ${(await response.text()).slice(0, 200)}` }
    return { ok: true, message: await aiResponseText(endpoint, response) }
  }
  catch (error) {
    return { ok: false, message: (error as Error).message }
  }
})
