import type { H3Event } from 'h3'
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { emptyManifest, findModule, LEARN_MANIFEST, LEARN_MODULES, learnProjectName, progressFromFiles, serializeManifest, type LearnGroupProgress, type LearnModuleProgress, type LearnStatus } from '@klonk/learn'

type Tx = Parameters<Parameters<typeof withUserDb>[1]>[0]
const { cloudFiles, cloudProjects, groupLearnModules, groupMembers, groups, users } = schema

/** Lernstand der Modulprojekte (RLS: eigene bzw. die der geleiteten Gruppen) */
async function progressOf(tx: Tx, projects: { id: string, learnModule: string | null, updatedAt: Date }[]) {
  const ids = projects.map(p => p.id)
  const files = ids.length
    ? await tx.select({ projectId: cloudFiles.projectId, path: cloudFiles.path, content: cloudFiles.content })
        .from(cloudFiles).where(and(inArray(cloudFiles.projectId, ids), eq(cloudFiles.deleted, false), eq(cloudFiles.folder, false)))
    : []
  const result = new Map<string, LearnModuleProgress>()
  for (const project of projects) {
    const module = findModule(project.learnModule ?? '')
    if (!module) continue
    result.set(project.id, {
      projectId: project.id,
      updatedAt: project.updatedAt.toISOString(),
      ...progressFromFiles(module, files.filter(f => f.projectId === project.id)),
    })
  }
  return result
}

/** Gruppen, die das Konto leitet (Gruppenleitung oder Admin der Organisation) */
async function ledGroups(tx: Tx) {
  return tx.select({ id: groups.id, name: groups.name }).from(groups)
    .where(sql`klonk.leads_group(${groups.id})`).orderBy(asc(groups.name))
}

export async function learnStatus(user: SessionUser, event: H3Event): Promise<LearnStatus> {
  const cloud = await cloudEnabled(user, event)
  const restricted = !!user.organizationId && user.role === 'member'
  return withUserDb(user.id, async (tx) => {
    let modules = LEARN_MODULES.map(m => m.id)
    if (restricted) {
      const enabled = await tx.selectDistinct({ moduleId: groupLearnModules.moduleId }).from(groupLearnModules)
        .innerJoin(groupMembers, eq(groupMembers.groupId, groupLearnModules.groupId))
        .where(eq(groupMembers.userId, user.id))
      const ids = new Set(enabled.map(e => e.moduleId))
      modules = modules.filter(id => ids.has(id))
    }

    const own = await tx.select({ id: cloudProjects.id, learnModule: cloudProjects.learnModule, updatedAt: cloudProjects.updatedAt })
      .from(cloudProjects).where(and(eq(cloudProjects.ownerId, user.id), isNotNull(cloudProjects.learnModule)))
    const progress = await progressOf(tx, own)

    const led = await ledGroups(tx)
    const ledIds = led.map(g => g.id)
    const enabled = ledIds.length ? await tx.select().from(groupLearnModules).where(inArray(groupLearnModules.groupId, ledIds)) : []
    const counts = ledIds.length
      ? await tx.select({ groupId: groupMembers.groupId, n: sql<number>`count(*)::int` }).from(groupMembers)
          .where(and(inArray(groupMembers.groupId, ledIds), eq(groupMembers.role, 'member'))).groupBy(groupMembers.groupId)
      : []

    return {
      cloud,
      modules,
      restricted,
      projects: Object.fromEntries(own.filter(p => progress.has(p.id)).map(p => [p.learnModule!, progress.get(p.id)!])),
      groups: led.map(g => ({
        id: g.id,
        name: g.name,
        modules: LEARN_MODULES.map(m => m.id).filter(id => enabled.some(e => e.groupId === g.id && e.moduleId === id)),
        members: counts.find(c => c.groupId === g.id)?.n ?? 0,
      })),
    }
  })
}

/** Modul starten: eigenes Cloud-Projekt anlegen (oder das schon begonnene liefern) */
export async function startLearnModule(user: SessionUser, moduleId: string, lang: 'de' | 'en') {
  const index = LEARN_MODULES.findIndex(m => m.id === moduleId)
  if (index < 0) throw createError({ statusCode: 404, message: 'learn_not_found' })
  return withUserDb(user.id, async (tx) => {
    const [started] = await tx.select().from(cloudProjects)
      .where(and(eq(cloudProjects.ownerId, user.id), eq(cloudProjects.learnModule, moduleId)))
    if (started) return started
    const [allowed] = await tx.execute<{ ok: boolean }>(sql`select klonk.can_start_learn_module(${moduleId}) as ok`)
    if (!allowed?.ok) throw createError({ statusCode: 403, message: 'learn_not_enabled' })
    return createCloudProject(tx, user, {
      name: learnProjectName(LEARN_MODULES[index]!, index, lang),
      learnModule: moduleId,
      unique: true,
      folders: [],
      files: [{ path: LEARN_MANIFEST, content: serializeManifest(emptyManifest(moduleId)) }],
    })
  })
}

/** Freigegebene Module einer Gruppe setzen (Gruppenleitung; RLS prüft) */
export async function setGroupLearnModules(user: SessionUser, groupId: string, modules: string[]) {
  const valid = modules.filter(id => findModule(id))
  return withUserDb(user.id, async (tx) => {
    const [lead] = await tx.execute<{ ok: boolean }>(sql`select klonk.leads_group(${groupId}) as ok`)
    if (!lead?.ok) throw createError({ statusCode: 403, message: 'forbidden' })
    await tx.delete(groupLearnModules).where(eq(groupLearnModules.groupId, groupId))
    if (valid.length) await tx.insert(groupLearnModules).values(valid.map(moduleId => ({ groupId, moduleId, enabledBy: user.id })))
    return { modules: valid }
  })
}

/** Lernstand aller Mitglieder einer Gruppe in den freigegebenen Modulen */
export async function groupLearnProgress(user: SessionUser, groupId: string): Promise<LearnGroupProgress> {
  return withUserDb(user.id, async (tx) => {
    const [group] = await tx.select({ id: groups.id, name: groups.name, lead: sql<boolean>`klonk.leads_group(${groups.id})` })
      .from(groups).where(eq(groups.id, groupId))
    if (!group?.lead) throw createError({ statusCode: 404, message: 'learn_not_found' })

    const enabled = new Set((await tx.select().from(groupLearnModules).where(eq(groupLearnModules.groupId, groupId))).map(e => e.moduleId))
    const modules = LEARN_MODULES.map(m => m.id).filter(id => enabled.has(id))
    const members = await tx.select({ userId: users.id, displayName: users.displayName, username: users.username })
      .from(groupMembers).innerJoin(users, eq(users.id, groupMembers.userId))
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.role, 'member'))).orderBy(asc(users.displayName))

    const projects = members.length && modules.length
      ? await tx.select({ id: cloudProjects.id, ownerId: cloudProjects.ownerId, learnModule: cloudProjects.learnModule, updatedAt: cloudProjects.updatedAt })
          .from(cloudProjects).where(and(inArray(cloudProjects.ownerId, members.map(m => m.userId)), inArray(cloudProjects.learnModule, modules)))
      : []
    const progress = await progressOf(tx, projects)

    return {
      id: group.id,
      name: group.name,
      modules,
      members: members.map(m => ({
        ...m,
        modules: Object.fromEntries(projects.filter(p => p.ownerId === m.userId && progress.has(p.id)).map(p => [p.learnModule!, progress.get(p.id)!])),
      })),
    }
  })
}
