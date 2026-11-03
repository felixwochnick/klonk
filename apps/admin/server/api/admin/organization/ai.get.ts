import { eq } from 'drizzle-orm'

// KI-Assistent der Organisation – der API-Schlüssel wird nie ausgeliefert.
// Gehostete Plattform: dazu die Modelle der Klonk-KI und das Kontingent der Organisation.
export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)

  const [row] = await withUserDb(user.id, tx => tx.select().from(schema.organizationAiSettings)
    .where(eq(schema.organizationAiSettings.organizationId, organizationId)))
  const instance = instanceAiSettings()
  const hosted = hasFeature(await getInstanceLicense(), 'hosted')

  let platform = null
  if (hosted) {
    const license = await getEffectiveLicense(organizationId, event)
    const quota = await aiQuota({ organizationId, userId: user.id, monthlyCredits: license.aiCredits })
    const toCredits = (millicredits: number) => Math.round(millicredits / 10) / 100
    platform = {
      models: await platformAiModels(),
      quota: {
        monthly: toCredits(quota.monthly),
        monthlyUsed: toCredits(quota.monthlyUsed),
        extra: toCredits(quota.extra),
        extraLeft: toCredits(quota.extraLeft),
        remaining: toCredits(quota.remaining),
      },
    }
  }

  return {
    mode: row?.mode ?? 'inherit',
    provider: row?.provider ?? 'openai',
    baseUrl: row?.baseUrl ?? null,
    models: row?.models ?? [],
    hasApiKey: !!row?.apiKey,
    webllmModel: row?.webllmModel ?? null,
    tutor: row?.tutor ?? true,
    studentDailyRequests: row?.studentDailyRequests ?? null,
    studentDailyCredits: row?.studentDailyCredits ?? null,
    hosted,
    platform,
    // Standard der Instanz (NUXT_AI_*) zur Anzeige
    instance: {
      mode: instance.mode,
      model: instance.mode === 'webllm' ? instance.webllmModel ?? AI_DEFAULT_WEBLLM_MODEL : instance.models[0]?.id ?? null,
      tutor: instance.tutor,
    },
  }
})
