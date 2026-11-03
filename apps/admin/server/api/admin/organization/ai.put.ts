export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)
  const input = await readValidated(event, aiSettingsSchema)
  // WebLLM ist immer kostenlos; der eigene Anbieter braucht die Lizenz, die Klonk-KI die gehostete Plattform
  if (input.mode === 'server') await requireFeature(organizationId, 'ai', event)
  if (input.mode === 'platform' && !hasFeature(await getInstanceLicense(), 'hosted'))
    throw createError({ statusCode: 409, message: 'ai_platform_unavailable' })

  const table = schema.organizationAiSettings
  return withUserDb(user.id, async (tx) => {
    const values = {
      mode: input.mode,
      provider: input.provider,
      baseUrl: input.baseUrl,
      models: input.models,
      apiKey: await resolveAiKey(tx, organizationId, input.apiKey),
      webllmModel: input.webllmModel,
      tutor: input.tutor,
      studentDailyRequests: input.studentDailyRequests,
      studentDailyCredits: input.studentDailyCredits,
      updatedAt: new Date(),
    }
    await tx.insert(table).values({ organizationId, ...values })
      .onConflictDoUpdate({ target: table.organizationId, set: values })
    return { ok: true }
  })
})
