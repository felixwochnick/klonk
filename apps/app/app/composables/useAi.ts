import type { WebLlmRequest, WebLlmResponse } from '~/workers/webllm'

export type AiMessage = AiChatMessage & { error?: boolean }

// Chat-Verlauf und WebLLM-Worker modulweit: bleiben beim Wechsel zwischen Seiten/Tabs erhalten
const messages = ref<AiMessage[]>([])
const busy = ref(false)
/** WebLLM: Laden des Modells (Fortschritt 0–1) */
const loading = ref<{ text: string, progress: number } | null>(null)
let abort: AbortController | undefined
let worker: Worker | undefined
let workerReady: Promise<void> | undefined
let requestId = 0
/** Gewähltes Modell (nur Server), leer = Standard der Organisation */
const model = ref('')

/** KI-Assistent: Server (eigener Anbieter oder Klonk-KI über /api/ai/chat) oder WebLLM im Browser */
export function useAi() {
  const { t, locale } = useI18n()
  const { data: config, refresh } = useFetch<AiClientConfig>('/api/ai/config', {
    key: 'ai-config',
    headers: clientHostHeaders(),
    server: false,
    default: (): AiClientConfig => ({ enabled: false, reason: 'off', mode: 'off', platform: false, tutor: true, webllmModel: null, models: [], notice: null }),
  })
  const enabled = computed(() => !!config.value?.enabled)

  /**
   * Frage stellen. `context` = Sprache, API-Referenz, Code, Fehler (geht in den Systemprompt, nicht in den Verlauf).
   * Die Antwort wächst beim Streamen in `messages`.
   */
  async function ask(question: string, context: string) {
    if (busy.value || !question.trim() || !config.value?.enabled) return
    messages.value.push({ role: 'user', content: question.trim().slice(0, AI_LIMITS.message) })
    // Verlauf auf die erlaubte Länge kürzen (älteste zuerst weg), fehlgeschlagene Antworten nicht mitschicken
    const history = messages.value.filter(m => !m.error).slice(-AI_LIMITS.messages + 1)
      .map(({ role, content }) => ({ role, content: content.slice(0, AI_LIMITS.message) }))
    const answer = reactive<AiMessage>({ role: 'assistant', content: '' })
    messages.value.push(answer)
    busy.value = true
    try {
      const write = (text: string) => {
        answer.content += text
      }
      if (config.value.mode === 'webllm') await askWebLlm(history, context.slice(0, AI_LIMITS.context), write)
      else await askServer(history, context.slice(0, AI_LIMITS.context), write)
    }
    catch (error) {
      if ((error as Error).name !== 'AbortError') {
        answer.error = true
        answer.content = (error as Error).message || t('errors.ai_upstream')
      }
    }
    finally {
      busy.value = false
      abort = undefined
      // Tageslimit/Kontingent können sich geändert haben (⇒ ggf. weiter mit WebLLM)
      if (config.value?.mode === 'server') void refresh()
    }
  }

  async function askServer(history: AiChatMessage[], context: string, write: (text: string) => void) {
    abort = new AbortController()
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...clientHostHeaders() },
      body: JSON.stringify({ messages: history, context, locale: locale.value, model: model.value || undefined }),
      signal: abort.signal,
    })
    if (!response.ok || !response.body) {
      const code = (await response.json().catch(() => null))?.message as string | undefined
      throw new Error(t(code && /^[a-z_]+$/.test(code) ? `errors.${code}` : 'errors.ai_upstream'))
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      write(value)
    }
  }

  async function askWebLlm(history: AiChatMessage[], context: string, write: (text: string) => void) {
    if (!('gpu' in navigator)) throw new Error(t('ai.noWebGpu'))
    await loadWebLlm(config.value!.webllmModel ?? AI_DEFAULT_WEBLLM_MODEL)
    const id = ++requestId
    const system = aiSystemPrompt({ tutor: config.value!.tutor, locale: locale.value, context })
    await new Promise<void>((resolve, reject) => {
      const onMessage = ({ data }: MessageEvent<WebLlmResponse>) => {
        if (!('id' in data) || data.id !== id) return
        if (data.type === 'token') write(data.text)
        else if (data.type === 'done' || data.type === 'error') {
          worker!.removeEventListener('message', onMessage)
          if (data.type === 'error') reject(new Error(data.message))
          else resolve()
        }
      }
      worker!.addEventListener('message', onMessage)
      worker!.postMessage({ type: 'chat', id, messages: [{ role: 'system', content: system }, ...history] } satisfies WebLlmRequest)
    })
  }

  function loadWebLlm(model: string) {
    workerReady ??= (async () => {
      const { default: WebLlmWorker } = await import('~/workers/webllm?worker')
      worker = new WebLlmWorker()
      loading.value = { text: '', progress: 0 }
      await new Promise<void>((resolve, reject) => {
        const onMessage = ({ data }: MessageEvent<WebLlmResponse>) => {
          if (data.type === 'progress') loading.value = { text: data.text, progress: data.progress }
          else if (data.type === 'ready' || (data.type === 'error' && data.id === undefined)) {
            worker!.removeEventListener('message', onMessage)
            if (data.type === 'ready') resolve()
            else reject(new Error(data.message))
          }
        }
        worker!.addEventListener('message', onMessage)
        worker!.postMessage({ type: 'load', model } satisfies WebLlmRequest)
      })
    })().catch((error) => {
      // Nächster Versuch lädt neu
      worker?.terminate()
      worker = undefined
      workerReady = undefined
      throw error
    }).finally(() => {
      loading.value = null
    })
    return workerReady
  }

  function stop() {
    abort?.abort()
    worker?.postMessage({ type: 'stop' } satisfies WebLlmRequest)
  }

  function clear() {
    stop()
    messages.value = []
  }

  return { config, refresh, enabled, model, messages, busy, loading, ask, stop, clear }
}
