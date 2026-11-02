import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { organizationAiSettings } from '../database/schema'

/** Wirksame KI-Einstellung inkl. Endpunkt und (entschlüsseltem) Schlüssel – verlässt den Server nie */
export type AiServerConfig = AiClientConfig & {
  baseUrl: string | null
  model: string | null
  apiKey: string | null
}

type AiSource = { mode: AiMode, baseUrl: string | null, model: string | null, apiKey: string | null, webllmModel: string | null, tutor: boolean }

/** Standard der Instanz aus NUXT_AI_* (für Organisationen ohne eigene Einstellung und Privatkonten) */
export function instanceAiSettings(): AiSource {
  const ai = useRuntimeConfig().ai
  const mode = (['server', 'webllm', 'off'] as const).find(m => m === ai.mode) ?? (ai.baseUrl ? 'server' : 'off')
  return {
    mode,
    baseUrl: ai.baseUrl || null,
    model: ai.model || null,
    apiKey: ai.apiKey || null,
    webllmModel: ai.webllmModel || null,
    tutor: ai.students !== 'full',
  }
}

/**
 * KI-Einstellung für einen Nutzer: Organisation (falls nicht `inherit`) oder Instanz, Lizenz-Feature `ai`.
 * Lehrkräfte, Admins und Betreiber bekommen immer volle Hilfe, Lernende je nach Einstellung nur Hinweise.
 */
export async function getAiConfig(user: SessionUser, event: H3Event): Promise<AiServerConfig> {
  let source = instanceAiSettings()
  if (user.organizationId) {
    const [row] = await withUserDb(user.id, tx => tx.select().from(organizationAiSettings)
      .where(eq(organizationAiSettings.organizationId, user.organizationId!)))
    if (row && row.mode !== 'inherit') {
      source = {
        mode: row.mode,
        baseUrl: row.baseUrl,
        model: row.model,
        apiKey: row.apiKey ? decryptSecret(row.apiKey) : null,
        webllmModel: row.webllmModel,
        tutor: row.tutor,
      }
    }
  }

  const licensed = hasFeature(await getEffectiveLicense(user.organizationId, event), 'ai')
  const configured = source.mode === 'webllm' || (source.mode === 'server' && !!source.baseUrl && !!source.model)
  const enabled = licensed && configured
  const student = user.role === 'member' && user.platformRole === 'user'
  return {
    enabled,
    reason: !licensed ? 'license' : configured ? null : 'off',
    mode: enabled ? source.mode : 'off',
    tutor: student && source.tutor,
    webllmModel: source.mode === 'webllm' ? source.webllmModel || AI_DEFAULT_WEBLLM_MODEL : null,
    baseUrl: source.baseUrl,
    model: source.model,
    apiKey: source.apiKey,
  }
}

/** Anfrage an einen OpenAI-kompatiblen Endpunkt (`/chat/completions`) */
export function fetchChatCompletion(config: Pick<AiServerConfig, 'baseUrl' | 'model' | 'apiKey'>, messages: { role: string, content: string }[], options: { stream: boolean, signal?: AbortSignal, maxTokens?: number }) {
  return fetch(`${config.baseUrl!.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: config.model, messages, stream: options.stream, ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}) }),
    signal: options.signal,
  })
}

/** Server-Sent Events der API ⇒ reiner Text (nur die Inhalts-Deltas) */
export function completionTextStream(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const data = line.trim().replace(/^data:\s*/, '')
        if (!line.trim().startsWith('data:') || data === '[DONE]') continue
        try {
          const text = JSON.parse(data).choices?.[0]?.delta?.content
          if (text) controller.enqueue(encoder.encode(text))
        }
        catch {
          // unvollständige oder fremde Zeilen überspringen
        }
      }
    },
  }))
}
