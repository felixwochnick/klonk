import type { H3Event } from 'h3'

// PDF für Unterrichtsmaterial: Die App erzeugt DOCX bzw. PPTX im Browser, der Server lässt daraus vom PDF-Dienst
// (Gotenberg mit LibreOffice, `NUXT_GOTENBERG_URL`) eine PDF machen – so sind Datei und PDF gleich, und Eingabefelder
// des DOCX werden zu ausfüllbaren PDF-Formularfeldern. Ohne Dienst druckt die App wie bisher über den Browser.

export type MaterialFileType = 'docx' | 'pptx'

/** Höchstens 40 MB je Datei (Bilder sind als PNG eingebettet) */
export const MATERIAL_PDF_MAX_BYTES = 40 * 1024 * 1024

export function materialPdfUrl() {
  return (useRuntimeConfig().gotenbergUrl as string | undefined)?.trim().replace(/\/+$/, '') ?? ''
}

/** Ist der PDF-Dienst eingerichtet und erreichbar? (Health-Check, 30 s gemerkt) – sonst bietet die App den Browser-Druck an */
let health: { at: number, ok: Promise<boolean> } | undefined
export function materialPdfAvailable(): Promise<boolean> {
  const base = materialPdfUrl()
  if (!base) return Promise.resolve(false)
  if (!health || Date.now() - health.at > 30_000) {
    health = {
      at: Date.now(),
      ok: fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) }).then(response => response.ok).catch(() => false),
    }
  }
  return health.ok
}

/** Wie in der Oberfläche: Lehrkräfte, Admins, Betreiber:innen und Privatkonten – mit Lizenz-Feature `customModules` */
export async function requireMaterialAccess(user: SessionUser, event: H3Event) {
  if (user.organizationId && user.role === 'member' && user.platformRole === 'user') throw createError({ statusCode: 403, message: 'forbidden' })
  const license = await getEffectiveLicense(user.organizationId, event, user.id)
  if (!hasFeature(license, 'customModules')) throw createError({ statusCode: 402, message: 'feature_required', data: { feature: 'customModules' } })
}

/** DOCX/PPTX ⇒ PDF über Gotenberg (`/forms/libreoffice/convert`); Eingabefelder werden PDF-Formularfelder */
export async function convertToPdf(file: Uint8Array, type: MaterialFileType): Promise<Uint8Array> {
  const base = materialPdfUrl()
  if (!base) throw createError({ statusCode: 503, message: 'material_pdf_unavailable' })
  const form = new FormData()
  // LibreOffice erkennt das Format an der Endung
  form.append('files', new Blob([file as BlobPart]), `material.${type}`)
  form.append('exportFormFields', 'true')
  let response: Response
  try {
    response = await fetch(`${base}/forms/libreoffice/convert`, { method: 'POST', body: form, signal: AbortSignal.timeout(120_000) })
  }
  catch (error) {
    console.error('[material-pdf] PDF-Dienst nicht erreichbar', error)
    throw createError({ statusCode: 503, message: 'material_pdf_unavailable' })
  }
  if (!response.ok) {
    console.error('[material-pdf] Umwandlung fehlgeschlagen', response.status, await response.text().catch(() => ''))
    throw createError({ statusCode: 502, message: 'material_pdf_failed' })
  }
  return new Uint8Array(await response.arrayBuffer())
}
