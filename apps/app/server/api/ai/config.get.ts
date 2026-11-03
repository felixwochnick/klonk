// KI-Assistent für den angemeldeten Nutzer: an/aus, Server oder Browser, Tutor, Modelle – ohne Endpunkt und Schlüssel
export default defineEventHandler(async (event): Promise<AiClientConfig> => {
  const { user } = await requireAuth(event)
  const { enabled, reason, mode, platform, tutor, webllmModel, models, notice } = await getAiConfig(user, event)
  return { enabled, reason, mode, platform, tutor, webllmModel, models, notice }
})
