// KI-Assistent für den angemeldeten Nutzer: an/aus, Server oder Browser, Tutor – ohne Endpunkt und Schlüssel
export default defineEventHandler(async (event): Promise<AiClientConfig> => {
  const { user } = await requireAuth(event)
  const { enabled, reason, mode, tutor, webllmModel } = await getAiConfig(user, event)
  return { enabled, reason, mode, tutor, webllmModel }
})
