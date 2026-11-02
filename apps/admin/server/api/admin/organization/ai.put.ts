export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)
  const input = await readValidated(event, aiSettingsSchema)
  // Den Assistenten einschalten erfordert die Lizenz (ausschalten/erben geht immer)
  if (input.mode === 'server' || input.mode === 'webllm') await requireFeature(organizationId, 'ai', event)

  const table = schema.organizationAiSettings
  return withUserDb(user.id, async (tx) => {
    const values = {
      mode: input.mode,
      baseUrl: input.baseUrl,
      model: input.model,
      apiKey: await resolveAiKey(tx, organizationId, input.apiKey),
      webllmModel: input.webllmModel,
      tutor: input.tutor,
      updatedAt: new Date(),
    }
    await tx.insert(table).values({ organizationId, ...values })
      .onConflictDoUpdate({ target: table.organizationId, set: values })
    return { ok: true }
  })
})
