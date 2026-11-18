import { z } from 'zod'

// DOCX/PPTX des Unterrichtsmaterials ⇒ PDF (Rohdaten im Body, Art per `?type=docx|pptx`)
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  await requireMaterialAccess(user, event)
  const { type } = await getValidatedQuery(event, z.object({ type: z.enum(['docx', 'pptx']) }).parse)
  if (Number(getHeader(event, 'content-length') ?? 0) > MATERIAL_PDF_MAX_BYTES) throw createError({ statusCode: 413, message: 'material_pdf_too_large' })
  const body = await readRawBody(event, false)
  if (!body?.length) throw createError({ statusCode: 400, message: 'invalid_input' })
  if (body.length > MATERIAL_PDF_MAX_BYTES) throw createError({ statusCode: 413, message: 'material_pdf_too_large' })
  // DOCX und PPTX sind ZIP-Archive
  if (body[0] !== 0x50 || body[1] !== 0x4B) throw createError({ statusCode: 400, message: 'invalid_input' })
  const pdf = await convertToPdf(new Uint8Array(body), type)
  setHeader(event, 'content-type', 'application/pdf')
  setHeader(event, 'cache-control', 'no-store')
  return pdf
})
