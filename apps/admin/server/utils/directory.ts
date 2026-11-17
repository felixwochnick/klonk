import type { H3Event } from 'h3'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'

/**
 * Konten und Gruppen einer Organisation – gemeinsam für die REST-API der Verwaltung und ihren MCP-Server.
 * Rechte prüft RLS (`withUserDb`), Rollenprüfungen der Routen bleiben dort bzw. in den MCP-Werkzeugen.
 */
const { groups, groupMembers, users } = schema

export const groupUpdateSchema = z.object({
  name: groupNameSchema.optional(),
  membersCanWrite: z.boolean().optional(),
  level: groupLevelSchema.optional(),
})

export const userCreateSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(200),
  role: roleSchema,
  password: passwordSchema,
})

export const userUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(200).optional(),
  role: roleSchema.optional(),
  disabled: z.boolean().optional(),
  // KI-Assistenten (MCP): höchste Stufe des Kontos – auch für das eigene Konto (Trigger in der DB prüft: nur Admins)
  mcpAccess: z.enum(MCP_ACCESS_LEVELS).optional(),
})

/** Klassen/Gruppen der Organisation (ohne Untergruppen, die zählen nur mit) */
export function listGroups(user: SessionUser, organizationId: string) {
  return withUserDb(user.id, tx => tx.select({
    id: groups.id,
    name: groups.name,
    membersCanWrite: groups.membersCanWrite,
    level: groups.level,
    members: sql<number>`(select count(*)::int from ${groupMembers} where ${groupMembers.groupId} = ${groups.id})`,
    subgroups: sql<number>`(select count(*)::int from ${groups} s where s.parent_id = ${groups.id})`,
    canManage: sql<boolean>`klonk.can_manage_group(${groups.id})`,
  }).from(groups).where(and(eq(groups.organizationId, organizationId), isNull(groups.parentId))).orderBy(asc(groups.name)))
}

/** Gruppe mit Mitgliedern */
export function getGroup(user: SessionUser, id: string) {
  return withUserDb(user.id, async (tx) => {
    const [group] = await tx.select({
      id: groups.id,
      name: groups.name,
      membersCanWrite: groups.membersCanWrite,
      level: groups.level,
      canManage: sql<boolean>`klonk.can_manage_group(${groups.id})`,
    }).from(groups).where(eq(groups.id, id))
    if (!group) throw createError({ statusCode: 404, message: 'group_not_found' })
    const members = await tx.select({
      userId: users.id,
      displayName: users.displayName,
      username: users.username,
      accountRole: users.role,
      role: groupMembers.role,
    }).from(groupMembers).innerJoin(users, eq(users.id, groupMembers.userId))
      .where(eq(groupMembers.groupId, id)).orderBy(asc(groupMembers.role), asc(users.displayName))
    return { ...group, members }
  })
}

/** Gruppe anlegen: Lehrkräfte der Organisation werden Gruppenleitung; dazu der gemeinsame Cloud-Ordner */
export function createGroup(user: SessionUser, organizationId: string, name: string, level?: string | null) {
  const leader = user.role === 'teacher' && user.organizationId === organizationId ? user.id : undefined
  return withUserDb(user.id, async tx => ({ id: await insertGroup(tx, organizationId, name, level, leader) }))
}

/** Name, Einordnung und Schreibrecht im gemeinsamen Ordner (Gruppenleitung oder Admin) */
export function updateGroup(user: SessionUser, id: string, input: z.infer<typeof groupUpdateSchema>) {
  return withUserDb(user.id, async (tx) => {
    const [group] = await tx.update(groups).set(input).where(eq(groups.id, id)).returning({ id: groups.id })
      .catch(error => rethrowUnique(error, 'group_exists'))
    if (!group) throw createError({ statusCode: 403, message: 'group_forbidden' })
    if (input.name) await tx.update(schema.cloudProjects).set({ name: input.name }).where(eq(schema.cloudProjects.groupId, id))
    return { ok: true }
  })
}

/** Gruppe samt gemeinsamem Ordner löschen (Bearbeitungen der Mitglieder bleiben in deren Cloud) */
export async function deleteGroup(user: SessionUser, id: string) {
  const deleted = await withUserDb(user.id, tx => tx.delete(groups).where(eq(groups.id, id)).returning({ id: groups.id }))
  if (!deleted.length) throw createError({ statusCode: 403, message: 'group_forbidden' })
  return { ok: true }
}

/** Mitglieder hinzufügen bzw. ihre Rolle ändern (nur Konten der Organisation – RLS prüft) */
export async function addGroupMembers(user: SessionUser, groupId: string, userIds: string[], role: 'leader' | 'member') {
  await withUserDb(user.id, tx => tx.insert(groupMembers).values(userIds.map(userId => ({ groupId, userId, role })))
    .onConflictDoUpdate({ target: [groupMembers.groupId, groupMembers.userId], set: { role } }))
    .catch(() => {
      throw createError({ statusCode: 403, message: 'group_forbidden' })
    })
  return { ok: true }
}

export async function removeGroupMember(user: SessionUser, groupId: string, userId: string) {
  const deleted = await withUserDb(user.id, tx => tx.delete(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId))).returning({ userId: groupMembers.userId }))
  if (!deleted.length) throw createError({ statusCode: 403, message: 'group_forbidden' })
  return { ok: true }
}

/** Konten der Organisation – die Sichtbarkeit begrenzt zusätzlich RLS (Lehrkräfte sehen ihre Organisation, Lernende nur sich) */
export async function listUsers(user: SessionUser, organizationId: string) {
  const rows = await withUserDb(user.id, tx => tx
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      disabled: users.disabled,
      hasPassword: users.passwordHash,
      mustChangePassword: users.mustChangePassword,
      mcpAccess: users.mcpAccess,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.organizationId, organizationId))
    .orderBy(asc(users.username)))
  return rows.map(({ hasPassword, ...row }) => ({ ...row, hasPassword: !!hasPassword }))
}

/** Lokales Konto anlegen (Admins) – Startpasswort, beim ersten Login zu ändern */
export async function createUser(user: SessionUser, organizationId: string, input: z.infer<typeof userCreateSchema>, event: H3Event) {
  await assertUserCapacity(organizationId, event)
  const passwordHash = await hashPassword(input.password)
  const [created] = await withUserDb(user.id, tx => tx.insert(users).values({
    organizationId,
    username: input.username,
    displayName: input.displayName,
    role: input.role,
    passwordHash,
    mustChangePassword: true,
  }).returning({ id: users.id })).catch(e => rethrowUnique(e, 'username_taken'))
  return created!
}

/** Anzeigename, Rolle, Sperre, KI-Zugriff (Admins); gesperrte Konten werden überall abgemeldet */
export async function updateUser(user: SessionUser, id: string, input: z.infer<typeof userUpdateSchema>) {
  if (id === user.id && (input.role || input.disabled))
    throw createError({ statusCode: 400, message: 'cannot_change_self' })
  const rows = await withUserDb(user.id, tx => tx.update(users).set(input).where(eq(users.id, id)).returning({ id: users.id }))
    .catch((error: { cause?: { message?: string } }) => {
      if (error?.cause?.message === 'mcp_access_forbidden') throw createError({ statusCode: 403, message: 'mcp_access_forbidden' })
      throw error
    })
  if (!rows.length) throw createError({ statusCode: 404, message: 'not_found' })
  if (input.disabled) await revokeUserSessions(id)
  return { ok: true }
}

/** Temporäres Passwort vergeben (Lehrkräfte für Lernende, Admins) – alle Sessions des Kontos enden */
export async function resetUserPassword(user: SessionUser, id: string, password: string) {
  if (id === user.id) throw createError({ statusCode: 400, message: 'cannot_change_self' })
  const passwordHash = await hashPassword(password)
  const rows = await withUserDb(user.id, tx => tx.update(users)
    .set({ passwordHash, mustChangePassword: true })
    .where(eq(users.id, id))
    .returning({ id: users.id }))
  if (!rows.length) throw createError({ statusCode: 404, message: 'not_found' })
  await revokeUserSessions(id)
  return { ok: true }
}
