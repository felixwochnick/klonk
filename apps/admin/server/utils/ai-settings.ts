import { eq } from 'drizzle-orm'
import { z } from 'zod'

const limit = z.number().int().min(1).max(1_000_000).nullable()

export const aiSettingsSchema = z.object({
  mode: z.enum(AI_SETTING_MODES),
  provider: z.enum(AI_PROVIDERS),
  baseUrl: z.url().max(500).nullable(),
  // Leer = bisherigen Schlüssel behalten, `null` = löschen
  apiKey: z.string().max(1000).nullable().optional(),
  models: z.array(z.object({ id: z.string().trim().min(1).max(200), access: z.enum(['all', 'teachers']) })).max(50),
  webllmModel: z.enum(AI_WEBLLM_MODELS).nullable(),
  tutor: z.boolean(),
  studentDailyRequests: limit,
  studentDailyCredits: limit,
}).refine(v => v.mode !== 'server' || (v.baseUrl && v.models.length), { message: 'ai_incomplete' })
  .refine(v => v.mode !== 'platform' || v.models.length, { message: 'ai_no_models' })

type UserTx = Parameters<Parameters<typeof withUserDb>[1]>[0]

/** Gespeicherten Schlüssel übernehmen, neuen verschlüsseln */
export async function resolveAiKey(tx: UserTx, organizationId: string, apiKey: string | null | undefined) {
  if (apiKey === null) return null
  if (apiKey) return encryptSecret(apiKey)
  const [current] = await tx.select({ apiKey: schema.organizationAiSettings.apiKey }).from(schema.organizationAiSettings)
    .where(eq(schema.organizationAiSettings.organizationId, organizationId))
  return current?.apiKey ?? null
}
