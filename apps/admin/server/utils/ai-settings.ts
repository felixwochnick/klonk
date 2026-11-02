import { eq } from 'drizzle-orm'
import { z } from 'zod'

export const aiSettingsSchema = z.object({
  mode: z.enum(['inherit', 'off', 'server', 'webllm']),
  baseUrl: z.url().max(500).nullable(),
  model: z.string().trim().max(200).nullable(),
  // Leer = bisherigen Schlüssel behalten, `null` = löschen
  apiKey: z.string().max(1000).nullable().optional(),
  webllmModel: z.enum(AI_WEBLLM_MODELS).nullable(),
  tutor: z.boolean(),
}).refine(v => v.mode !== 'server' || (v.baseUrl && v.model), { message: 'ai_incomplete' })

type UserTx = Parameters<Parameters<typeof withUserDb>[1]>[0]

/** Gespeicherten Schlüssel übernehmen, neuen verschlüsseln */
export async function resolveAiKey(tx: UserTx, organizationId: string, apiKey: string | null | undefined) {
  if (apiKey === null) return null
  if (apiKey) return encryptSecret(apiKey)
  const [current] = await tx.select({ apiKey: schema.organizationAiSettings.apiKey }).from(schema.organizationAiSettings)
    .where(eq(schema.organizationAiSettings.organizationId, organizationId))
  return current?.apiKey ?? null
}
