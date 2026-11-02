// Prüft den OpenAI-kompatiblen Endpunkt mit einer kurzen Anfrage (mit den eingegebenen, noch ungespeicherten Werten)
export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)
  const input = await readValidated(event, aiSettingsSchema)
  if (input.mode !== 'server') throw createError({ statusCode: 400, message: 'ai_incomplete' })

  const encrypted = await withUserDb(user.id, tx => resolveAiKey(tx, organizationId, input.apiKey))
  const config = { baseUrl: input.baseUrl, model: input.model, apiKey: encrypted ? decryptSecret(encrypted) : null }
  try {
    const response = await fetchChatCompletion(config, [{ role: 'user', content: 'Reply with OK.' }], { stream: false, maxTokens: 5, signal: AbortSignal.timeout(30_000) })
    if (!response.ok) return { ok: false, message: `${response.status} ${(await response.text()).slice(0, 200)}` }
    const data = await response.json() as { model?: string, choices?: { message?: { content?: string } }[] }
    return { ok: true, message: `${data.model ?? input.model}: ${data.choices?.[0]?.message?.content?.trim() ?? ''}` }
  }
  catch (error) {
    return { ok: false, message: (error as Error).message }
  }
})
