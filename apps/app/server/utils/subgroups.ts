import { and, asc, eq, inArray, isNotNull, notInArray, sql } from 'drizzle-orm'
import { z } from 'zod'

/**
 * Untergruppen (Teams) einer Klasse: die Leitung der Klasse legt sie an und verwaltet sie (RLS: `can_manage_group`
 * gilt auch über die Klasse). Jede Untergruppe hat wie jede Gruppe einen gemeinsamen Cloud-Ordner – im Modus `project`
 * das gemeinsame Projekt, im Modus `world` die Startwelt der gemeinsamen Welt.
 */
const { cloudFiles, cloudProjects, groupMembers, groups, users } = schema
type Tx = Parameters<Parameters<typeof withUserDb>[1]>[0]

export const subgroupNameSchema = z.string().trim().min(1).max(60).refine(name => !/[/\\]/.test(name) && !name.startsWith('.'), 'invalid_name')
const path = z.string().refine(isValidCloudPath, 'cloud_invalid_path')

export const createSubgroupSchema = z.object({
  name: subgroupNameSchema,
  mode: z.enum(COLLAB_MODES),
  memberIds: z.array(z.uuid()).max(200).default([]),
  /** Startdateien des gemeinsamen Ordners (Projekt bzw. Startwelt), legt die App an */
  files: z.array(z.object({ path, content: z.string().max(CLOUD_LIMITS.fileBytes) })).max(20).default([]),
})

export const updateSubgroupSchema = z.object({
  name: subgroupNameSchema.optional(),
  mode: z.enum(COLLAB_MODES).optional(),
  membersCanWrite: z.boolean().optional(),
  memberIds: z.array(z.uuid()).max(200).optional(),
})

const projectName = (name: string, parent: string) => `${name} (${parent})`

/** Klasse, die der Nutzer leitet (sonst 404) */
async function ledClass(tx: Tx, groupId: string) {
  const [group] = await tx.select({ id: groups.id, name: groups.name, organizationId: groups.organizationId, parentId: groups.parentId, lead: sql<boolean>`klonk.leads_group(${groups.id})` })
    .from(groups).where(eq(groups.id, groupId))
  if (!group || group.parentId || !group.lead) throw createError({ statusCode: 404, message: 'group_not_found' })
  return group
}

/** Untergruppe, die der Nutzer verwalten darf (sonst 404) */
async function managedSubgroup(tx: Tx, id: string) {
  const [group] = await tx.select({ id: groups.id, name: groups.name, parentId: groups.parentId, manage: sql<boolean>`klonk.can_manage_group(${groups.id})` })
    .from(groups).where(and(eq(groups.id, id), isNotNull(groups.parentId)))
  if (!group?.manage) throw createError({ statusCode: 404, message: 'group_not_found' })
  return group as typeof group & { parentId: string }
}

const forbidden = () => {
  throw createError({ statusCode: 403, message: 'group_forbidden' })
}

export async function subgroupsOverview(user: SessionUser, groupId: string): Promise<SubgroupsOverview> {
  return withUserDb(user.id, async (tx) => {
    const group = await ledClass(tx, groupId)
    const members = await tx.select({ userId: users.id, displayName: users.displayName, username: users.username, role: groupMembers.role })
      .from(groupMembers).innerJoin(users, eq(users.id, groupMembers.userId))
      .where(eq(groupMembers.groupId, groupId)).orderBy(asc(users.displayName))
    const subgroups = await tx.select({ id: groups.id, name: groups.name, mode: groups.collabMode, membersCanWrite: groups.membersCanWrite })
      .from(groups).where(eq(groups.parentId, groupId)).orderBy(asc(groups.name))
    const ids = subgroups.map(s => s.id)
    const memberships = ids.length
      ? await tx.select({ groupId: groupMembers.groupId, userId: users.id, displayName: users.displayName, username: users.username })
          .from(groupMembers).innerJoin(users, eq(users.id, groupMembers.userId))
          .where(inArray(groupMembers.groupId, ids)).orderBy(asc(users.displayName))
      : []
    const projects = ids.length ? await tx.select({ id: cloudProjects.id, groupId: cloudProjects.groupId }).from(cloudProjects).where(inArray(cloudProjects.groupId, ids)) : []
    return {
      id: group.id,
      name: group.name,
      members,
      subgroups: subgroups.map(s => ({
        id: s.id,
        name: s.name,
        mode: s.mode ?? 'project',
        membersCanWrite: s.membersCanWrite,
        projectId: projects.find(p => p.groupId === s.id)?.id ?? null,
        members: memberships.filter(m => m.groupId === s.id).map(({ groupId: _, ...m }) => m),
      })),
    }
  })
}

export async function createSubgroup(user: SessionUser, groupId: string, input: z.infer<typeof createSubgroupSchema>) {
  return withUserDb(user.id, async (tx) => {
    const parent = await ledClass(tx, groupId)
    const [subgroup] = await tx.insert(groups)
      .values({ organizationId: parent.organizationId, name: input.name, parentId: groupId, collabMode: input.mode, membersCanWrite: true })
      .returning({ id: groups.id })
      .catch((error: { cause?: { code?: string } }) => {
        if (error?.cause?.code === '23505') throw createError({ statusCode: 409, message: 'group_exists' })
        throw error
      })
    const memberIds = [...new Set(input.memberIds)]
    if (memberIds.length) {
      // RLS: nur Mitglieder der Klasse
      await tx.insert(groupMembers).values(memberIds.map(userId => ({ groupId: subgroup!.id, userId, role: 'member' as const }))).catch(forbidden)
    }
    const sizes = input.files.map(f => Buffer.byteLength(f.content))
    const [project] = await tx.insert(cloudProjects).values({
      groupId: subgroup!.id,
      name: projectName(input.name, parent.name),
      revision: input.files.length ? 1 : 0,
      size: sizes.reduce((sum, s) => sum + s, 0),
    }).returning({ id: cloudProjects.id })
    if (input.files.length) {
      await tx.insert(cloudFiles).values(input.files.map((f, i) => ({ projectId: project!.id, path: f.path, content: f.content, size: sizes[i]!, revision: 1, updatedBy: user.id })))
    }
    return { id: subgroup!.id, projectId: project!.id }
  })
}

export async function updateSubgroup(user: SessionUser, id: string, input: z.infer<typeof updateSubgroupSchema>) {
  return withUserDb(user.id, async (tx) => {
    const subgroup = await managedSubgroup(tx, id)
    const changes = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.mode !== undefined ? { collabMode: input.mode } : {}),
      ...(input.membersCanWrite !== undefined ? { membersCanWrite: input.membersCanWrite } : {}),
    }
    if (Object.keys(changes).length) {
      const updated = await tx.update(groups).set(changes).where(eq(groups.id, id)).returning({ id: groups.id })
        .catch((error: { cause?: { code?: string } }) => {
          if (error?.cause?.code === '23505') throw createError({ statusCode: 409, message: 'group_exists' })
          throw error
        })
      if (!updated.length) forbidden()
      if (input.name !== undefined) {
        const [parent] = await tx.select({ name: groups.name }).from(groups).where(eq(groups.id, subgroup.parentId))
        await tx.update(cloudProjects).set({ name: projectName(input.name, parent?.name ?? '') }).where(eq(cloudProjects.groupId, id))
      }
    }
    if (input.memberIds) {
      const memberIds = [...new Set(input.memberIds)]
      await tx.delete(groupMembers).where(and(eq(groupMembers.groupId, id), memberIds.length ? notInArray(groupMembers.userId, memberIds) : undefined))
      if (memberIds.length) {
        await tx.insert(groupMembers).values(memberIds.map(userId => ({ groupId: id, userId, role: 'member' as const })))
          .onConflictDoNothing().catch(forbidden)
      }
    }
    return { ok: true }
  })
}

export async function deleteSubgroup(user: SessionUser, id: string) {
  return withUserDb(user.id, async (tx) => {
    await managedSubgroup(tx, id)
    const deleted = await tx.delete(groups).where(and(eq(groups.id, id), isNotNull(groups.parentId))).returning({ id: groups.id })
    if (!deleted.length) forbidden()
    return { ok: true }
  })
}
