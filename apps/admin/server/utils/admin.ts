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

/** Token vor dem Speichern prüfen – ungültige/fremde Tokens gar nicht erst ablegen */
export async function assertValidToken(token: string) {
  const license = await verifyLicenseToken(token, {
    allowDevKeys: import.meta.dev,
    host: new URL(useRuntimeConfig().public.appUrl).hostname,
  })
  if (license.problem === 'invalid' || license.problem === 'wrong_domain')
    throw createError({ statusCode: 400, message: `license_${license.problem}` })
}

export const groupNameSchema = z.string().trim().min(1).max(100).refine(name => !/[/\\]/.test(name) && !name.startsWith('.'), 'invalid_name')

/** Jahrgangsstufe (`'5'`), Zusatzkurse (`'courses'`) oder nicht zugeordnet (`null`) */
export const groupLevelSchema = z.string().regex(/^(\d{1,2}|courses)$/).nullable()

type UserTx = Parameters<Parameters<typeof withUserDb>[1]>[0]

/**
 * Gruppe samt gemeinsamem Cloud-Ordner anlegen (Name je Organisation eindeutig ⇒ `group_exists`). Die Gruppenleitung
 * muss vor dem Ordner eingetragen sein – RLS prüft beim Ordner, wer die Gruppe verwaltet.
 */
export async function insertGroup(tx: UserTx, organizationId: string, name: string, level: string | null = null, leaderId?: string) {
  const [group] = await tx.insert(schema.groups).values({ organizationId, name, level }).returning({ id: schema.groups.id })
    .catch(error => rethrowUnique(error, 'group_exists'))
  if (leaderId) await tx.insert(schema.groupMembers).values({ groupId: group!.id, userId: leaderId, role: 'leader' })
  await tx.insert(schema.cloudProjects).values({ groupId: group!.id, name })
  return group!.id
}
