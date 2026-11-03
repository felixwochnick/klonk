import type { H3Event } from 'h3'
import { and, eq, gte, isNull, or, sql } from 'drizzle-orm'
import { aiCreditGrants, aiUsage, instanceSettings, organizationAiSettings } from '../database/schema'

/** Endpunkt für eine Anfrage – verlässt den Server nie */
export type AiEndpoint = { provider: AiProvider, baseUrl: string, apiKey: string | null, model: string }

/** Wirksame KI-Einstellung inkl. Endpunkt des gewählten Modells und Abrechnung */
export type AiServerConfig = AiClientConfig & {
  /** Nur bei `mode: 'server'` */
  endpoint: AiEndpoint | null
  /** Modell-ID für den Verbrauch (bei der Klonk-KI die Katalog-ID) */
  modelId: string | null
  /** Klonk-KI: Preis des Modells und Kontingent */
  price: Pick<AiPlatformModel, 'inputCredits' | 'outputCredits'> | null
  account: AiAccount
}

/** Wessen Verbrauch zählt: Organisation (Pool) oder Privatkonto */
export type AiAccount = { organizationId: string | null, userId: string, monthlyCredits: number }

type AiSource = {
  mode: Exclude<AiSettingMode, 'inherit'>
  provider: AiProvider
  baseUrl: string | null
  apiKey: string | null
  models: AiModelChoice[]
  webllmModel: string | null
  tutor: boolean
  studentDailyRequests: number | null
  studentDailyCredits: number | null
}

/** Standard der Instanz aus NUXT_AI_* (für Organisationen ohne eigene Einstellung und Privatkonten) */
export function instanceAiSettings(): AiSource {
  const ai = useRuntimeConfig().ai
  const mode = (['server', 'webllm', 'off'] as const).find(m => m === ai.mode) ?? (ai.baseUrl ? 'server' : 'off')
  return {
    mode,
    provider: ai.provider === 'anthropic' ? 'anthropic' : 'openai',
    baseUrl: ai.baseUrl || null,
    apiKey: ai.apiKey || null,
    models: String(ai.model ?? '').split(',').map(id => id.trim()).filter(Boolean).map(id => ({ id, access: 'all' as const })),
    webllmModel: ai.webllmModel || null,
    tutor: ai.students !== 'full',
    studentDailyRequests: null,
    studentDailyCredits: null,
  }
}

/** Runtime-Config-Werte kommen als JSON-Text oder (von Nuxt aus der Umgebung gelesen) schon als Objekt */
function parseJson<T>(value: unknown): T | null {
  if (!value) return null
  if (typeof value !== 'string') return value as T
  try {
    return JSON.parse(value) as T
  }
  catch {
    console.warn('[ai] Ungültiges JSON in der KI-Konfiguration')
    return null
  }
}

type PlatformProviders = Record<string, { provider?: AiProvider, baseUrl: string, apiKey?: string }>

/** Modelle der Klonk-KI, für die der Betreiber einen Endpunkt hinterlegt hat */
export async function platformAiModels(): Promise<AiPlatformModel[]> {
  const providers = parseJson<PlatformProviders>(useRuntimeConfig().ai.platformProviders) ?? {}
  const [row] = await useSystemDb().select().from(instanceSettings).where(eq(instanceSettings.key, AI_MODELS_KEY))
  const models = (row?.value as AiPlatformModel[] | undefined) ?? parseJson<AiPlatformModel[]>(useRuntimeConfig().ai.platformModels) ?? []
  return models.filter(m => providers[m.provider]?.baseUrl)
}

function platformEndpoint(model: AiPlatformModel): AiEndpoint {
  const provider = parseJson<PlatformProviders>(useRuntimeConfig().ai.platformProviders)![model.provider]!
  return { provider: provider.provider ?? 'openai', baseUrl: provider.baseUrl, apiKey: provider.apiKey ?? null, model: model.model }
}

/** Ohne eigene Auswahl: alle Modelle, teure nur für Lehrkräfte */
function defaultPlatformChoices(catalog: AiPlatformModel[]): AiModelChoice[] {
  return catalog.map(m => ({ id: m.id, access: m.premium ? 'teachers' : 'all' }))
}

async function organizationSource(user: SessionUser): Promise<AiSource | null> {
  if (!user.organizationId) return null
  const [row] = await withUserDb(user.id, tx => tx.select().from(organizationAiSettings)
    .where(eq(organizationAiSettings.organizationId, user.organizationId!)))
  if (!row || row.mode === 'inherit') return null
  return {
    mode: row.mode,
    provider: row.provider,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey ? decryptSecret(row.apiKey) : null,
    models: row.models,
    webllmModel: row.webllmModel,
    tutor: row.tutor,
    studentDailyRequests: row.studentDailyRequests,
    studentDailyCredits: row.studentDailyCredits,
  }
}

const startOfDay = sql`date_trunc('day', now())`
const startOfMonth = sql`date_trunc('month', now())`

function accountFilter(account: Pick<AiAccount, 'organizationId' | 'userId'>) {
  return account.organizationId
    ? eq(aiUsage.organizationId, account.organizationId)
    : and(isNull(aiUsage.organizationId), eq(aiUsage.userId, account.userId))
}

/**
 * Kontingent der Klonk-KI in Tausendstel-Credits: erst das Monatskontingent aus der Lizenz, dann nachgekaufte Credits.
 * Nachgekaufte zählen ab dem ältesten noch gültigen Kauf (abgelaufene verfallen mit ihrem Rest).
 */
export async function aiQuota(account: AiAccount) {
  const db = useSystemDb()
  const [month] = await db.select({
    used: sql<string>`coalesce(sum(${aiUsage.millicredits}), 0)`,
    extra: sql<string>`coalesce(sum(${aiUsage.extraMillicredits}), 0)`,
  }).from(aiUsage).where(and(accountFilter(account), eq(aiUsage.source, 'platform'), gte(aiUsage.createdAt, startOfMonth)))

  const grants = await db.select({ credits: aiCreditGrants.credits, createdAt: aiCreditGrants.createdAt }).from(aiCreditGrants).where(and(
    account.organizationId ? eq(aiCreditGrants.organizationId, account.organizationId) : eq(aiCreditGrants.userId, account.userId),
    or(isNull(aiCreditGrants.validUntil), sql`${aiCreditGrants.validUntil} > now()`),
  ))
  let extraUsed = 0
  if (grants.length) {
    const since = new Date(Math.min(...grants.map(g => g.createdAt.getTime())))
    const [row] = await db.select({ extra: sql<string>`coalesce(sum(${aiUsage.extraMillicredits}), 0)` }).from(aiUsage)
      .where(and(accountFilter(account), gte(aiUsage.createdAt, since)))
    extraUsed = Number(row?.extra ?? 0)
  }

  const monthly = account.monthlyCredits * MILLI
  const monthlyUsed = Number(month?.used ?? 0) - Number(month?.extra ?? 0)
  const extra = grants.reduce((sum, g) => sum + g.credits, 0) * MILLI
  const monthlyLeft = Math.max(0, monthly - monthlyUsed)
  const extraLeft = Math.max(0, extra - extraUsed)
  return { monthly, monthlyUsed, extra, extraUsed, monthlyLeft, extraLeft, remaining: monthlyLeft + extraLeft }
}

/** Heutiger Verbrauch eines Nutzers (für die Tageslimits von Lernenden) */
async function usageToday(userId: string) {
  const [row] = await useSystemDb().select({
    requests: sql<number>`count(*)::int`,
    millicredits: sql<string>`coalesce(sum(${aiUsage.millicredits}), 0)`,
  }).from(aiUsage).where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, startOfDay)))
  return { requests: row?.requests ?? 0, millicredits: Number(row?.millicredits ?? 0) }
}

/**
 * KI-Einstellung für einen Nutzer. Quelle: Organisation (falls nicht `inherit`) oder Instanz; Privatkonten der
 * gehosteten Plattform mit Credits nutzen die Klonk-KI. WebLLM ist immer kostenlos und springt ein, wenn
 * der eigene Schlüssel keine Lizenz hat oder Credits/Tageslimit aufgebraucht sind.
 * Lehrkräfte, Admins und Betreiber bekommen immer volle Hilfe, Lernende je nach Einstellung nur Hinweise.
 */
export async function getAiConfig(user: SessionUser, event: H3Event, options: { model?: string } = {}): Promise<AiServerConfig> {
  const hosted = hasFeature(await getInstanceLicense(), 'hosted')
  const license = await getEffectiveLicense(user.organizationId, event, user.id)
  const account: AiAccount = { organizationId: user.organizationId, userId: user.id, monthlyCredits: license.aiCredits }
  const student = user.role === 'member' && user.platformRole === 'user'

  let source = await organizationSource(user) ?? instanceAiSettings()
  if (hosted && !user.organizationId && source.mode !== 'off' && (await aiQuota(account)).remaining > 0)
    source = { ...instanceAiSettings(), mode: 'platform', models: [] }

  const base = {
    tutor: student && source.tutor,
    webllmModel: source.webllmModel || AI_DEFAULT_WEBLLM_MODEL,
    account,
    endpoint: null,
    modelId: null,
    price: null,
  }
  const off: AiServerConfig = { ...base, enabled: false, reason: 'off', mode: 'off', platform: false, webllmModel: null, models: [], notice: null }
  const webllm = (notice: AiNotice): AiServerConfig => ({ ...base, enabled: true, reason: null, mode: 'webllm', platform: false, models: [], notice })

  if (source.mode === 'off') return off
  if (source.mode === 'webllm') return webllm(null)
  if (source.mode === 'server' && !hasFeature(license, 'ai')) return webllm('license')
  if (source.mode === 'platform' && !hosted) return off

  const catalog = source.mode === 'platform' ? await platformAiModels() : []
  const choices = source.mode === 'platform' && !source.models.length ? defaultPlatformChoices(catalog) : source.models
  const models = choices
    .filter(c => !student || c.access === 'all')
    .map(c => source.mode === 'platform' ? catalog.find(m => m.id === c.id) : { id: c.id, label: c.id })
    .filter((m): m is NonNullable<typeof m> => !!m)
    .map(m => ({ id: m.id, label: m.label }))
  if (!models.length || (source.mode === 'server' && !source.baseUrl)) return source.mode === 'platform' ? webllm(null) : off

  // Tageslimits (nur Lernende) und Kontingent der Klonk-KI
  if (student && (source.studentDailyRequests !== null || source.studentDailyCredits !== null)) {
    const today = await usageToday(user.id)
    if (source.studentDailyRequests !== null && today.requests >= source.studentDailyRequests) return webllm('daily')
    if (source.mode === 'platform' && source.studentDailyCredits !== null && today.millicredits >= source.studentDailyCredits * MILLI) return webllm('daily')
  }
  if (source.mode === 'platform' && (await aiQuota(account)).remaining <= 0) return webllm('quota')

  const chosen = models.find(m => m.id === options.model) ?? models[0]!
  const platformModel = catalog.find(m => m.id === chosen.id)
  return {
    ...base,
    enabled: true,
    reason: null,
    mode: 'server',
    platform: source.mode === 'platform',
    models,
    notice: null,
    modelId: chosen.id,
    endpoint: platformModel
      ? platformEndpoint(platformModel)
      : { provider: source.provider, baseUrl: source.baseUrl!, apiKey: source.apiKey, model: chosen.id },
    price: platformModel ? { inputCredits: platformModel.inputCredits, outputCredits: platformModel.outputCredits } : null,
  }
}

/** Verbrauch einer Anfrage speichern; Klonk-KI: Kosten zuerst aus dem Monatskontingent, Rest aus nachgekauften Credits */
export async function recordAiUsage(config: AiServerConfig, usage: { input: number, output: number }) {
  const millicredits = config.platform && config.price ? aiCostMillicredits(config.price, usage) : 0
  const extra = millicredits ? Math.max(0, millicredits - (await aiQuota(config.account)).monthlyLeft) : 0
  await useSystemDb().insert(aiUsage).values({
    organizationId: config.account.organizationId,
    userId: config.account.userId,
    source: config.platform ? 'platform' : 'server',
    model: config.modelId ?? '',
    inputTokens: usage.input,
    outputTokens: usage.output,
    millicredits,
    extraMillicredits: extra,
  })
}

type ChatMessage = { role: string, content: string }
type ChatOptions = { signal?: AbortSignal, maxTokens?: number }

const isOpenAiCom = (baseUrl: string) => /^https:\/\/api\.openai\.com\//.test(baseUrl)

/**
 * Anfrage an den Anbieter. OpenAI-kompatibel: `/chat/completions` (Verbrauch über `stream_options`, neue
 * OpenAI-Modelle brauchen `max_completion_tokens`); Anthropic: `/messages`. Lehnt ein Server einen Parameter ab,
 * wird ohne ihn wiederholt.
 */
export async function fetchAiChat(endpoint: AiEndpoint, system: string, messages: ChatMessage[], options: ChatOptions & { stream: boolean }) {
  const base = endpoint.baseUrl.replace(/\/+$/, '')
  const maxTokens = options.maxTokens ?? AI_MAX_OUTPUT_TOKENS
  if (endpoint.provider === 'anthropic') {
    return fetch(`${base}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        ...(endpoint.apiKey ? { 'x-api-key': endpoint.apiKey } : {}),
      },
      body: JSON.stringify({ model: endpoint.model, system, messages, max_tokens: maxTokens, stream: options.stream }),
      signal: options.signal,
    })
  }

  let tokenParam = isOpenAiCom(base) ? 'max_completion_tokens' : 'max_tokens'
  let includeUsage = options.stream
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(endpoint.apiKey ? { authorization: `Bearer ${endpoint.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: endpoint.model,
        messages: [{ role: 'system', content: system }, ...messages],
        stream: options.stream,
        [tokenParam]: maxTokens,
        ...(includeUsage ? { stream_options: { include_usage: true } } : {}),
      }),
      signal: options.signal,
    })
    if (attempt >= 2 || (response.status !== 400 && response.status !== 422)) return response
    const detail = await response.clone().text().catch(() => '')
    if (includeUsage && detail.includes('stream_options')) includeUsage = false
    else if (detail.includes(tokenParam)) tokenParam = tokenParam === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens'
    else return response
  }
}

/** Text einer nicht gestreamten Antwort (Verbindungstest) */
export async function aiResponseText(endpoint: AiEndpoint, response: Response) {
  const data = await response.json() as {
    model?: string
    choices?: { message?: { content?: string } }[]
    content?: { type: string, text?: string }[]
  }
  const text = endpoint.provider === 'anthropic'
    ? data.content?.filter(c => c.type === 'text').map(c => c.text).join('')
    : data.choices?.[0]?.message?.content
  return `${data.model ?? endpoint.model}: ${text?.trim() ?? ''}`
}

/** Zählt beim Streamen mit: Tokens laut Anbieter, sonst grob geschätzt (≈ 4 Zeichen je Token) */
export class AiUsageTracker {
  input: number | null = null
  output: number | null = null
  outputChars = 0
  constructor(private inputChars = 0) {}

  get usage() {
    return {
      input: this.input ?? Math.ceil(this.inputChars / 4),
      output: this.output ?? Math.ceil(this.outputChars / 4),
    }
  }
}

/** Server-Sent Events des Anbieters ⇒ reiner Text; Verbrauch landet im Tracker */
export function aiTextStream(body: ReadableStream<Uint8Array>, provider: AiProvider, tracker = new AiUsageTracker()) {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''

  type Event = {
    type?: string
    message?: { usage?: Record<string, number | undefined> }
    delta?: { type?: string, text?: string }
    usage?: { output_tokens?: number, prompt_tokens?: number, completion_tokens?: number }
    choices?: { delta?: { content?: string } }[]
  }

  function handle(data: Event): string | undefined {
    if (provider === 'anthropic') {
      if (data.type === 'message_start' && data.message?.usage) {
        const u = data.message.usage
        tracker.input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
      }
      if (data.type === 'message_delta' && data.usage?.output_tokens !== undefined) tracker.output = data.usage.output_tokens
      if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') return data.delta.text
      return undefined
    }
    if (data.usage) {
      tracker.input = data.usage.prompt_tokens ?? tracker.input
      tracker.output = data.usage.completion_tokens ?? tracker.output
    }
    return data.choices?.[0]?.delta?.content
  }

  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.replace(/^data:\s*/, '')
        if (data === '[DONE]') continue
        try {
          const text = handle(JSON.parse(data))
          if (text) {
            tracker.outputChars += text.length
            controller.enqueue(encoder.encode(text))
          }
        }
        catch {
          // unvollständige oder fremde Zeilen überspringen
        }
      }
    },
  }))
}
