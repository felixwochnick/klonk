import type { H3Event } from 'h3'
import { and, asc, eq, gt, inArray, isNotNull, like, or, sql } from 'drizzle-orm'
import { cloudAssignments, cloudFiles, cloudProjects, groupMembers, groups, users } from '../database/schema'

type Tx = Parameters<Parameters<typeof withUserDb>[1]>[0]

/** Selbst gehostet ist die Cloud immer frei, auf der gehosteten Plattform braucht sie das Abo (Feature `cloud`) */
export async function cloudEnabled(user: SessionUser, event: H3Event) {
  if (!hasFeature(await getInstanceLicense(), 'hosted')) return true
  return hasFeature(await getEffectiveLicense(user.organizationId, event, user.id), 'cloud')
}

/** Schreiben/Anlegen nur mit Abo – Lesen (Herunterladen) bleibt immer möglich */
export async function requireCloud(user: SessionUser, event: H3Event) {
  if (!await cloudEnabled(user, event)) throw createError({ statusCode: 402, message: 'feature_required', data: { feature: 'cloud' } })
}

export function cloudQuotas() {
  const config = useRuntimeConfig().cloud
  return { user: Number(config.userQuotaMb) * 1024 * 1024, group: Number(config.groupQuotaMb) * 1024 * 1024 }
}

const byteLength = (text: string | null) => (text ? Buffer.byteLength(text) : 0)

async function usedByOwner(tx: Tx, ownerId: string) {
  const [row] = await tx.select({ used: sql<string>`coalesce(sum(${cloudProjects.size}), 0)` }).from(cloudProjects)
    .where(eq(cloudProjects.ownerId, ownerId))
  return Number(row?.used ?? 0)
}

/** Kontingent prüfen: eigene Projekte (inkl. Abgaben) zusammen, gemeinsame Ordner je Gruppe */
async function assertQuota(tx: Tx, project: { ownerId: string | null, size: number }, delta: number) {
  if (delta <= 0) return
  const quotas = cloudQuotas()
  const used = project.ownerId ? await usedByOwner(tx, project.ownerId) : project.size
  if (used + delta > (project.ownerId ? quotas.user : quotas.group)) throw createError({ statusCode: 413, message: 'cloud_quota' })
}

/** Projekt, das der Nutzer lesen darf (RLS), sonst 404 */
export async function readableProject(tx: Tx, id: string) {
  const [project] = await tx.select().from(cloudProjects).where(eq(cloudProjects.id, id))
  if (!project) throw createError({ statusCode: 404, message: 'cloud_not_found' })
  return project
}

export async function canWriteProject(tx: Tx, id: string) {
  const [row] = await tx.execute<{ ok: boolean }>(sql`select klonk.can_write_cloud_project(${id}) as ok`)
  return !!row?.ok
}

/** Übersicht: eigene Projekte, Gruppen mit gemeinsamem Ordner und Aufgaben, Kontingent */
export async function cloudStatus(user: SessionUser, event: H3Event): Promise<CloudStatus> {
  const enabled = await cloudEnabled(user, event)
  return withUserDb(user.id, async (tx) => {
    const own = await tx.select().from(cloudProjects).where(eq(cloudProjects.ownerId, user.id)).orderBy(asc(cloudProjects.name))
    const memberships = await tx.select({ id: groups.id, name: groups.name, membersCanWrite: groups.membersCanWrite, role: groupMembers.role })
      .from(groupMembers).innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(eq(groupMembers.userId, user.id)).orderBy(asc(groups.name))
    const groupIds = memberships.map(g => g.id)
    const shared = groupIds.length ? await tx.select().from(cloudProjects).where(inArray(cloudProjects.groupId, groupIds)) : []
    const assignments = groupIds.length
      ? await tx.select().from(cloudAssignments).where(inArray(cloudAssignments.groupId, groupIds)).orderBy(asc(cloudAssignments.path))
      : []

    const info = (p: typeof own[number], writable: boolean): CloudProjectInfo => ({
      id: p.id,
      name: p.name,
      kind: p.groupId ? 'group' : p.assignmentId ? 'submission' : 'personal',
      writable: enabled && writable,
      groupId: p.groupId,
      assignmentId: p.assignmentId,
      size: p.size,
      updatedAt: p.updatedAt.toISOString(),
    })
    return {
      enabled,
      quota: { used: own.reduce((sum, p) => sum + p.size, 0), limit: cloudQuotas().user },
      projects: own.map(p => info(p, true)),
      groups: memberships.map((g) => {
        const project = shared.find(p => p.groupId === g.id)
        return {
          id: g.id,
          name: g.name,
          leader: g.role === 'leader',
          membersCanWrite: g.membersCanWrite,
          projectId: project?.id ?? null,
          assignments: assignments.filter(a => a.groupId === g.id).map(a => ({
            id: a.id,
            path: a.path,
            projectId: own.find(p => p.assignmentId === a.id)?.id ?? null,
          })),
        }
      }),
    }
  })
}

/** Änderungen seit einer Revision (mit Inhalt); bei sehr vielen in mehreren Runden (`more`) */
export async function cloudChanges(user: SessionUser, event: H3Event, projectId: string, since: number): Promise<CloudChanges> {
  const enabled = await cloudEnabled(user, event)
  return withUserDb(user.id, async (tx) => {
    const project = await readableProject(tx, projectId)
    let rows = await tx.select().from(cloudFiles)
      .where(and(eq(cloudFiles.projectId, projectId), gt(cloudFiles.revision, since)))
      .orderBy(asc(cloudFiles.revision), asc(cloudFiles.path)).limit(CLOUD_LIMITS.changes + 1)
    const more = rows.length > CLOUD_LIMITS.changes
    let revision = project.revision
    if (more) {
      // Keine Revision halb ausliefern (mehrere Dateien können dieselbe haben, z. B. Ordner gelöscht)
      const last = rows.at(-1)!.revision
      const complete = rows.filter(r => r.revision < last)
      rows = complete.length ? complete : rows
      revision = rows.at(-1)!.revision
    }
    return {
      revision,
      writable: enabled && await canWriteProject(tx, projectId),
      more,
      changes: rows.map(r => ({ path: r.path, folder: r.folder, deleted: r.deleted, revision: r.revision, content: r.deleted || r.folder ? null : r.content })),
    }
  })
}

/** Gleichzeitige Änderung: Server-Stand für den Client (der seine Fassung als Konfliktkopie behält) */
export class CloudConflict extends Error {
  constructor(readonly current: CloudChange) {
    super('cloud_conflict')
  }
}

export type CloudWrite = { path: string, folder: boolean, deleted: boolean, content: string | null, baseRevision: number }

/**
 * Datei/Ordner schreiben oder löschen. `baseRevision` = Stand, den der Client kannte (0 = neu); passt er nicht,
 * gibt es einen Konflikt. Das Projekt wird zuerst gesperrt (Revision hochzählen), dann geprüft – alles in einer Transaktion.
 */
export async function writeCloudEntry(user: SessionUser, projectId: string, input: CloudWrite) {
  return withUserDb(user.id, async (tx) => {
    const [project] = await tx.update(cloudProjects)
      .set({ revision: sql`${cloudProjects.revision} + 1`, updatedAt: new Date() })
      .where(eq(cloudProjects.id, projectId)).returning()
    if (!project) {
      await readableProject(tx, projectId)
      throw createError({ statusCode: 403, message: 'cloud_read_only' })
    }

    const [existing] = await tx.select().from(cloudFiles).where(and(eq(cloudFiles.projectId, projectId), eq(cloudFiles.path, input.path)))
    const live = existing && !existing.deleted ? existing : undefined

    // Ordner anlegen ist idempotent, Ordner löschen nimmt alles darin mit (ohne Konfliktprüfung)
    if (input.folder && input.deleted) {
      const removed = await tx.update(cloudFiles)
        .set({ deleted: true, content: null, size: 0, revision: project.revision, updatedBy: user.id, updatedAt: new Date() })
        .where(and(eq(cloudFiles.projectId, projectId), eq(cloudFiles.deleted, false), or(eq(cloudFiles.path, input.path), like(cloudFiles.path, `${escapeLike(input.path)}/%`))))
        .returning({ size: cloudFiles.size })
      const freed = removed.reduce((sum, r) => sum + r.size, 0)
      await tx.update(cloudProjects).set({ size: sql`${cloudProjects.size} - ${freed}` }).where(eq(cloudProjects.id, projectId))
      return { revision: project.revision }
    }
    if (input.folder && live?.folder) return { revision: live.revision }

    if (!input.folder && (existing?.revision ?? 0) !== input.baseRevision) {
      throw new CloudConflict({
        path: input.path,
        folder: existing?.folder ?? false,
        deleted: !live,
        revision: existing?.revision ?? 0,
        content: live && !live.folder ? live.content : null,
      })
    }

    const size = input.deleted || input.folder ? 0 : byteLength(input.content)
    if (size > CLOUD_LIMITS.fileBytes) throw createError({ statusCode: 413, message: 'cloud_file_too_large' })
    const delta = size - (live?.size ?? 0)
    await assertQuota(tx, { ownerId: project.ownerId, size: project.size }, delta)
    if (!live && !input.deleted) {
      const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(cloudFiles)
        .where(and(eq(cloudFiles.projectId, projectId), eq(cloudFiles.deleted, false)))
      if ((count?.n ?? 0) >= CLOUD_LIMITS.files) throw createError({ statusCode: 413, message: 'cloud_too_many_files' })
    }
    if (delta) await tx.update(cloudProjects).set({ size: sql`${cloudProjects.size} + ${delta}` }).where(eq(cloudProjects.id, projectId))

    const values = {
      folder: input.folder,
      content: input.deleted || input.folder ? null : input.content,
      size,
      deleted: input.deleted,
      revision: project.revision,
      updatedBy: user.id,
      updatedAt: new Date(),
    }
    await tx.insert(cloudFiles).values({ projectId, path: input.path, ...values })
      .onConflictDoUpdate({ target: [cloudFiles.projectId, cloudFiles.path], set: values })
    return { revision: project.revision }
  })
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, c => `\\${c}`)

/** Name, der beim Eigentümer noch frei ist (`Aufgabe`, `Aufgabe 2`, …) */
async function freeName(tx: Tx, ownerId: string, name: string) {
  const taken = new Set((await tx.select({ name: cloudProjects.name }).from(cloudProjects).where(eq(cloudProjects.ownerId, ownerId))).map(p => p.name))
  if (!taken.has(name)) return name
  for (let i = 2; ; i++) if (!taken.has(`${name} ${i}`)) return `${name} ${i}`
}

export type CloudUpload = { files: { path: string, content: string }[], folders: string[] }

/** Eigenes Projekt anlegen, optional mit Inhalt (Hochladen eines lokalen Projekts oder Kopie einer Aufgabe) */
export async function createCloudProject(tx: Tx, user: SessionUser, input: { name: string, assignmentId?: string | null, unique?: boolean } & CloudUpload) {
  if (input.files.length + input.folders.length > CLOUD_LIMITS.files) throw createError({ statusCode: 413, message: 'cloud_too_many_files' })
  const sizes = input.files.map(f => byteLength(f.content))
  if (sizes.some(s => s > CLOUD_LIMITS.fileBytes)) throw createError({ statusCode: 413, message: 'cloud_file_too_large' })
  const size = sizes.reduce((sum, s) => sum + s, 0)
  await assertQuota(tx, { ownerId: user.id, size: 0 }, size)

  const name = input.unique ? await freeName(tx, user.id, input.name) : input.name
  const [existing] = await tx.select({ id: cloudProjects.id }).from(cloudProjects)
    .where(and(eq(cloudProjects.ownerId, user.id), eq(cloudProjects.name, name)))
  if (existing) throw createError({ statusCode: 409, message: 'cloud_exists' })

  const hasContent = input.files.length + input.folders.length > 0
  const [project] = await tx.insert(cloudProjects)
    .values({ ownerId: user.id, name, assignmentId: input.assignmentId ?? null, revision: hasContent ? 1 : 0, size })
    .returning()
  if (hasContent) {
    await tx.insert(cloudFiles).values([
      ...input.folders.map(path => ({ projectId: project!.id, path, folder: true, revision: 1, updatedBy: user.id })),
      ...input.files.map((f, i) => ({ projectId: project!.id, path: f.path, content: f.content, size: sizes[i]!, revision: 1, updatedBy: user.id })),
    ])
  }
  return project!
}

/** Aufgabe bearbeiten: eigenes Projekt als Kopie des Aufgabenordners (oder das schon begonnene) */
export async function startAssignment(user: SessionUser, assignmentId: string) {
  return withUserDb(user.id, async (tx) => {
    const [assignment] = await tx.select().from(cloudAssignments).where(eq(cloudAssignments.id, assignmentId))
    if (!assignment) throw createError({ statusCode: 404, message: 'cloud_not_found' })
    const [started] = await tx.select().from(cloudProjects)
      .where(and(eq(cloudProjects.ownerId, user.id), eq(cloudProjects.assignmentId, assignmentId)))
    if (started) return started

    const [shared] = await tx.select({ id: cloudProjects.id }).from(cloudProjects).where(eq(cloudProjects.groupId, assignment.groupId))
    const prefix = `${assignment.path}/`
    const entries = shared
      ? await tx.select().from(cloudFiles).where(and(eq(cloudFiles.projectId, shared.id), eq(cloudFiles.deleted, false), like(cloudFiles.path, `${escapeLike(prefix)}%`)))
      : []
    return createCloudProject(tx, user, {
      name: assignment.path.split('/').at(-1)!,
      assignmentId,
      unique: true,
      folders: entries.filter(e => e.folder).map(e => e.path.slice(prefix.length)),
      files: entries.filter(e => !e.folder).map(e => ({ path: e.path.slice(prefix.length), content: e.content ?? '' })),
    })
  })
}

/** Abgaben einer Aufgabe (für die Gruppenleitung; RLS liefert anderen nichts) */
export async function assignmentSubmissions(user: SessionUser, assignmentId: string) {
  return withUserDb(user.id, async (tx) => {
    const [assignment] = await tx.select().from(cloudAssignments).where(eq(cloudAssignments.id, assignmentId))
    if (!assignment) throw createError({ statusCode: 404, message: 'cloud_not_found' })
    return tx.select({
      projectId: cloudProjects.id,
      name: cloudProjects.name,
      userId: users.id,
      displayName: users.displayName,
      updatedAt: cloudProjects.updatedAt,
    }).from(cloudProjects).innerJoin(users, eq(users.id, cloudProjects.ownerId))
      .where(and(eq(cloudProjects.assignmentId, assignmentId), isNotNull(cloudProjects.ownerId)))
      .orderBy(asc(users.displayName))
  })
}
