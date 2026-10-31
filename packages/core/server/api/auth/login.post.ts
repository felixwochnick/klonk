import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const { identifier, password } = await readValidated(event, z.object({
    identifier: z.string().min(3).max(320),
    password: z.string().min(1).max(1000),
  }))

  const user = await loginWithPassword(identifier, password)
  if (!user) throw createError({ statusCode: 401, message: 'invalid_credentials' })

  return { user: await startUserSession(event, user) }
})
