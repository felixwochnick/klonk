import { z } from 'zod'

// Lehrkräfte (für Lernende) und Admins vergeben ein temporäres Passwort – RLS prüft, wer wen ändern darf
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { roles: ['teacher', 'admin'] })
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.uuid() }).parse)
  const { password } = await readValidated(event, z.object({ password: passwordSchema }))
  return resetUserPassword(user, id, password)
})
