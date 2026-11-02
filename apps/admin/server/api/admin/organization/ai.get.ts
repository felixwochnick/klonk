import { eq } from 'drizzle-orm'

// KI-Assistent der Organisation – der API-Schlüssel wird nie ausgeliefert
export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)

  const [row] = await withUserDb(user.id, tx => tx.select().from(schema.organizationAiSettings)
    .where(eq(schema.organizationAiSettings.organizationId, organizationId)))
  const instance = instanceAiSettings()

  return {
    mode: row?.mode ?? 'inherit',
    baseUrl: row?.baseUrl ?? null,
    model: row?.model ?? null,
    hasApiKey: !!row?.apiKey,
    webllmModel: row?.webllmModel ?? null,
    tutor: row?.tutor ?? true,
    // Standard der Instanz (NUXT_AI_*) zur Anzeige
    instance: { mode: instance.mode, model: instance.mode === 'webllm' ? instance.webllmModel ?? AI_DEFAULT_WEBLLM_MODEL : instance.model, tutor: instance.tutor },
  }
})
