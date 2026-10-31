import type { H3Event } from 'h3'
import type { z } from 'zod'

/**
 * Body validieren; Fehler als Code (`createError({ message })`), den die UI über `errors.<code>` übersetzt.
 * Eigene Codes aus `refine(…, { message: 'code' })` werden durchgereicht, sonst `invalid_input`.
 */
export async function readValidated<T extends z.ZodType>(event: H3Event, schema: T): Promise<z.output<T>> {
  const result = schema.safeParse(await readBody(event))
  if (result.success) return result.data

  const message = result.error.issues[0]?.message
  throw createError({
    statusCode: 400,
    message: message && /^[a-z_]+$/.test(message) ? message : 'invalid_input',
    data: { issues: result.error.issues.map(i => ({ path: i.path.join('.'), code: i.code })) },
  })
}
