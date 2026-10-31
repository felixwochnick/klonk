import type { H3Event } from 'h3'
import { z } from 'zod'

/** Zielorganisation: eigene Organisation, Plattform-Admins dürfen per `?organizationId=` wechseln */
export async function resolveOrganizationId(event: H3Event, user: SessionUser, isPlatformAdmin: boolean) {
  const { organizationId } = await getValidatedQuery(event, z.object({ organizationId: z.uuid().optional() }).parse)
  const id = (isPlatformAdmin && organizationId) || user.organizationId
  if (!id) throw createError({ statusCode: 400, message: 'organization_required' })
  return id
}

/** Postgres-Unique-Verletzungen in sprechende Fehler übersetzen */
export function rethrowUnique(error: unknown, message: string): never {
  const cause = (error as { cause?: { code?: string } })?.cause
  if (cause?.code === '23505') throw createError({ statusCode: 409, message })
  throw error
}

export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{2,64}$/)
export const passwordSchema = z.string().min(8).max(1000)
export const roleSchema = z.enum(['member', 'teacher', 'admin'])
export const domainSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/)
