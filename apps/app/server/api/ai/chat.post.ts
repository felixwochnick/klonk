import { z } from 'zod'

const bodySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(AI_LIMITS.message),
  })).min(1).max(AI_LIMITS.messages),
  // Editor-Kontext (Sprache, API-Referenz, Code, Fehler) – landet im Systemprompt
  context: z.string().max(AI_LIMITS.context).optional(),
  locale: z.string().max(10).optional(),
  /** Gewähltes Modell (muss für den Nutzer freigegeben sein, sonst das Standardmodell) */
  model: z.string().max(200).optional(),
})

// Chat über den Anbieter der Organisation/Instanz bzw. die Klonk-KI; Antwort als Text-Stream.
// Systemprompt (Tutor oder volle Hilfe) setzt der Server – der Client kann die Regeln nicht ändern.
// Limits und Kontingent prüft getAiConfig(), der Verbrauch wird nach der Antwort gespeichert (ohne Inhalte).
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const body = await readValidated(event, bodySchema)
  const config = await getAiConfig(user, event, { model: body.model })
  if (config.mode !== 'server' || !config.endpoint) {
    const code = config.notice === 'quota' ? 'ai_quota' : config.notice === 'daily' ? 'ai_daily_limit' : 'ai_unavailable'
    throw createError({ statusCode: 409, message: code })
  }

  // Bricht der Browser ab (Stopp-Knopf), auch die Anfrage an das LLM beenden
  const abort = new AbortController()
  const system = aiSystemPrompt({ tutor: config.tutor, locale: body.locale ?? 'de', context: body.context })
  const tracker = new AiUsageTracker(system.length + body.messages.reduce((sum, m) => sum + m.content.length, 0))
  let recorded = false
  const record = async () => {
    if (recorded) return
    recorded = true
    await recordAiUsage(config, tracker.usage).catch(error => console.warn('[ai] Verbrauch nicht gespeichert:', error))
  }
  // (am Response: `close` des Requests feuert schon, wenn der Body gelesen ist)
  event.node.res.on('close', () => {
    if (!event.node.res.writableFinished) abort.abort()
    void record()
  })

  const response = await fetchAiChat(config.endpoint, system, body.messages, { stream: true, signal: abort.signal }).catch(() => null)
  if (!response?.ok || !response.body) {
    recorded = true
    const detail = response ? `${response.status} ${(await response.text().catch(() => '')).slice(0, 200)}` : 'network'
    console.warn('[ai] Anfrage fehlgeschlagen:', detail)
    throw createError({ statusCode: 502, message: 'ai_upstream' })
  }

  setResponseHeaders(event, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' })
  // Verbrauch vor dem Ende der Antwort speichern – fragt die App gleich danach den Stand ab, zählt die Anfrage schon
  const done = new TransformStream<Uint8Array, Uint8Array>({ flush: () => record() })
  return sendStream(event, aiTextStream(response.body, config.endpoint.provider, tracker).pipeThrough(done))
})
