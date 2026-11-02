import { z } from 'zod'

const bodySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(AI_LIMITS.message),
  })).min(1).max(AI_LIMITS.messages),
  // Editor-Kontext (Sprache, API-Referenz, Code, Fehler) – landet im Systemprompt
  context: z.string().max(AI_LIMITS.context).optional(),
  locale: z.string().max(10).optional(),
})

// Chat über die OpenAI-kompatible API der Organisation/Instanz; Antwort als Text-Stream.
// Systemprompt (Tutor oder volle Hilfe) setzt der Server – der Client kann die Regeln nicht ändern.
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const body = await readValidated(event, bodySchema)
  const config = await getAiConfig(user, event)
  if (config.reason === 'license') await requireFeature(user.organizationId, 'ai', event)
  if (!config.enabled || config.mode !== 'server') throw createError({ statusCode: 409, message: 'ai_unavailable' })

  // Bricht der Browser ab (Stopp-Knopf), auch die Anfrage an das LLM beenden
  const abort = new AbortController()
  // (am Response: `close` des Requests feuert schon, wenn der Body gelesen ist)
  event.node.res.on('close', () => {
    if (!event.node.res.writableFinished) abort.abort()
  })

  const messages = [
    { role: 'system', content: aiSystemPrompt({ tutor: config.tutor, locale: body.locale ?? 'de', context: body.context }) },
    ...body.messages,
  ]
  const response = await fetchChatCompletion(config, messages, { stream: true, signal: abort.signal }).catch(() => null)
  if (!response?.ok || !response.body) {
    const detail = response ? `${response.status} ${(await response.text().catch(() => '')).slice(0, 200)}` : 'network'
    console.warn('[ai] Anfrage fehlgeschlagen:', detail)
    throw createError({ statusCode: 502, message: 'ai_upstream' })
  }

  setResponseHeaders(event, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' })
  return sendStream(event, completionTextStream(response.body))
})
