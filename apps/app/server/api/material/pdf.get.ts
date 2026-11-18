// Ist der PDF-Dienst eingerichtet und erreichbar? Ohne ihn druckt die App über den Browser.
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  return { available: await materialPdfAvailable() }
})
