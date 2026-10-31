export default defineEventHandler(async (event) => {
  await endUserSession(event)
  return { ok: true }
})
