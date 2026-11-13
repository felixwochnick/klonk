import type { H3Event } from 'h3'
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { choiceLanguages, findModule, LEARN_LANGUAGES, LEARN_MODULES, LEARN_STORAGES, learnProjectName, learnStorages, moduleProjectFiles, progressFromFiles, type LearnGroupProgress, type LearnLanguage, type LearnLanguageChoice, type LearnModuleProgress, type LearnStatus, type LearnStorage, type TeachingOverview, type TeachingProgress } from '@klonk/learn'

type Tx = Parameters<Parameters<typeof withUserDb>[1]>[0]
const { cloudFiles, cloudProjects, groupLearnModules, groupMembers, groups, organizations, users } = schema

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

/** Speicherorte, die die Organisation für Lernmodule erlaubt (Privatkonten: alle) */
async function organizationStorage(tx: Tx, organizationId: string | null | undefined): Promise<LearnStorage[]> {
  if (!organizationId) return [...LEARN_STORAGES]
  const [org] = await tx.select({ learnStorage: organizations.learnStorage }).from(organizations).where(eq(organizations.id, organizationId))
  return org ? learnStorages(org.learnStorage) : [...LEARN_STORAGES]
}

type Allowed = { languages: LearnLanguage[], storage: LearnStorage[] }

/**
 * Startbare Module mit erlaubten Sprachen und Speicherorten: Privatkonten und Lehrkräfte/Admins alle mit beiden Sprachen
 * und den Orten der Organisation, Lernende einer Organisation nur in einer ihrer Gruppen freigegebene (Sprachen und Orte
 * aller Freigaben zusammen, Orte nie über die Organisation hinaus)
 */
async function allowedModules(tx: Tx, user: SessionUser) {
  const orgStorage = await organizationStorage(tx, user.organizationId)
  const all = new Map<string, Allowed>(LEARN_MODULES.map(m => [m.id, { languages: [...LEARN_LANGUAGES], storage: orgStorage }]))
  if (!user.organizationId || user.role !== 'member') return all
  const rows = await tx.select({ moduleId: groupLearnModules.moduleId, languages: groupLearnModules.languages, storage: groups.learnStorage }).from(groupLearnModules)
    .innerJoin(groupMembers, eq(groupMembers.groupId, groupLearnModules.groupId))
    .innerJoin(groups, eq(groups.id, groupLearnModules.groupId))
    .where(eq(groupMembers.userId, user.id))
  const allowed = new Map<string, Allowed>()
  for (const module of LEARN_MODULES) {
    const releases = rows.filter(r => r.moduleId === module.id)
    if (!releases.length) continue
    const choices = releases.flatMap(r => choiceLanguages(r.languages))
    allowed.set(module.id, {
      languages: LEARN_LANGUAGES.filter(l => choices.includes(l)),
      storage: orgStorage.filter(s => releases.some(r => (r.storage ?? orgStorage).includes(s))),
    })
  }
  return allowed
}

export async function learnStatus(user: SessionUser, event: H3Event): Promise<LearnStatus> {
  const cloud = await cloudEnabled(user, event)
  const restricted = !!user.organizationId && user.role === 'member'
  return withUserDb(user.id, async (tx) => {
    const allowed = await allowedModules(tx, user)
    const modules = [...allowed.keys()]

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
      languages: Object.fromEntries([...allowed].map(([id, a]) => [id, a.languages])),
      storage: Object.fromEntries([...allowed].map(([id, a]) => [id, a.storage.filter(s => s !== 'cloud' || cloud)])),
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

/** Modul in der Cloud starten: eigenes Cloud-Projekt anlegen (oder das schon begonnene liefern); lokal legt der Browser es an */
export async function startLearnModule(user: SessionUser, moduleId: string, lang: 'de' | 'en') {
  const index = LEARN_MODULES.findIndex(m => m.id === moduleId)
  if (index < 0) throw createError({ statusCode: 404, message: 'learn_not_found' })
  return withUserDb(user.id, async (tx) => {
    const [started] = await tx.select().from(cloudProjects)
      .where(and(eq(cloudProjects.ownerId, user.id), eq(cloudProjects.learnModule, moduleId)))
    if (started) return started
    const [ok] = await tx.execute<{ ok: boolean }>(sql`select klonk.can_start_learn_module(${moduleId}) as ok`)
    if (!ok?.ok) throw createError({ statusCode: 403, message: 'learn_not_enabled' })

    const allowed = (await allowedModules(tx, user)).get(moduleId)
    if (!allowed?.storage.includes('cloud')) throw createError({ statusCode: 403, message: 'learn_storage' })

    // Je Aufgabe ein Ordner mit Aufgabentext, Welt(en) und Programm in der ersten erlaubten Sprache
    const module = LEARN_MODULES[index]!
    const { folders, files } = moduleProjectFiles(module, lang, allowed.languages[0] ?? 'blocks')
    return createCloudProject(tx, user, {
      name: learnProjectName(module, index, lang),
      learnModule: moduleId,
      unique: true,
      folders,
      files,
    })
  })
}

/**
 * Freigegebene Module einer Gruppe mit Sprachvorgabe setzen, optional die Speicherorte der Gruppe (`null` = Vorgabe der
 * Organisation) – Gruppenleitung; RLS prüft
 */
export async function setGroupLearnModules(user: SessionUser, groupId: string, modules: { id: string, languages: LearnLanguageChoice }[], storage?: LearnStorage[] | null) {
  const valid = modules.filter(m => findModule(m.id))
  return withUserDb(user.id, async (tx) => {
    const [lead] = await tx.execute<{ ok: boolean }>(sql`select klonk.leads_group(${groupId}) as ok`)
    if (!lead?.ok) throw createError({ statusCode: 403, message: 'forbidden' })
    await tx.delete(groupLearnModules).where(eq(groupLearnModules.groupId, groupId))
    if (valid.length) await tx.insert(groupLearnModules).values(valid.map(m => ({ groupId, moduleId: m.id, languages: m.languages, enabledBy: user.id })))
    if (storage !== undefined) await tx.update(groups).set({ learnStorage: storage && learnStorages(storage) }).where(eq(groups.id, groupId))
    return { modules: valid }
  })
}

/** Lernstand aller Mitglieder einer Gruppe in den freigegebenen Modulen */
export async function groupLearnProgress(user: SessionUser, groupId: string): Promise<LearnGroupProgress> {
  return withUserDb(user.id, async (tx) => {
    const [group] = await tx.select({ id: groups.id, name: groups.name, level: groups.level, organizationId: groups.organizationId, storage: groups.learnStorage, lead: sql<boolean>`klonk.leads_group(${groups.id})` })
      .from(groups).where(eq(groups.id, groupId))
    if (!group?.lead) throw createError({ statusCode: 404, message: 'learn_not_found' })

    const rows = await tx.select().from(groupLearnModules).where(eq(groupLearnModules.groupId, groupId))
    const modules = LEARN_MODULES.map(m => m.id).filter(id => rows.some(r => r.moduleId === id))
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
      level: group.level,
      modules,
      languages: Object.fromEntries(rows.map(r => [r.moduleId, r.languages])),
      storage: group.storage && learnStorages(group.storage),
      organizationStorage: await organizationStorage(tx, group.organizationId),
      members: members.map(m => ({
        ...m,
        modules: Object.fromEntries(projects.filter(p => p.ownerId === m.userId && progress.has(p.id)).map(p => [p.learnModule!, progress.get(p.id)!])),
      })),
    }
  })
}

/** Unterricht: Schule (Bundesland, Schulform ⇒ Lehrplan je Jahrgangsstufe) und geleitete Gruppen mit Stufe und Freigaben */
export async function teachingOverview(user: SessionUser): Promise<TeachingOverview> {
  return withUserDb(user.id, async (tx) => {
    const [org] = user.organizationId
      ? await tx.select({ type: organizations.type, country: organizations.country, state: organizations.state, schoolForm: organizations.schoolForm })
          .from(organizations).where(eq(organizations.id, user.organizationId))
      : []
    const led = await tx.select({ id: groups.id, name: groups.name, level: groups.level }).from(groups)
      .where(sql`klonk.leads_group(${groups.id})`).orderBy(asc(groups.name))
    const ids = led.map(g => g.id)
    const enabled = ids.length ? await tx.select().from(groupLearnModules).where(inArray(groupLearnModules.groupId, ids)) : []
    const counts = ids.length
      ? await tx.select({ groupId: groupMembers.groupId, n: sql<number>`count(*)::int` }).from(groupMembers)
          .where(and(inArray(groupMembers.groupId, ids), eq(groupMembers.role, 'member'))).groupBy(groupMembers.groupId)
      : []
    return {
      school: org ?? null,
      admin: !!user.organizationId && user.role === 'admin',
      groups: led.map((g) => {
        const rows = enabled.filter(e => e.groupId === g.id)
        return {
          ...g,
          members: counts.find(c => c.groupId === g.id)?.n ?? 0,
          modules: LEARN_MODULES.map(m => m.id).filter(id => rows.some(r => r.moduleId === id)),
          languages: Object.fromEntries(rows.map(r => [r.moduleId, r.languages])),
        }
      }),
    }
  })
}

/** Lernstand der geleiteten Gruppen einer Jahrgangsstufe (`'none'` = nicht zugeordnet, `'all'` = alle) – je freigegebenem Modul zusammengefasst */
export async function teachingProgress(user: SessionUser, level: string): Promise<TeachingProgress> {
  return withUserDb(user.id, async (tx) => {
    const led = await tx.select({ id: groups.id }).from(groups)
      .where(and(sql`klonk.leads_group(${groups.id})`, level === 'all' ? undefined : level === 'none' ? sql`${groups.level} is null` : eq(groups.level, level)))
    const ids = led.map(g => g.id)
    if (!ids.length) return {}
    const enabled = await tx.select({ groupId: groupLearnModules.groupId, moduleId: groupLearnModules.moduleId }).from(groupLearnModules)
      .where(inArray(groupLearnModules.groupId, ids))
    const members = await tx.select({ groupId: groupMembers.groupId, userId: groupMembers.userId }).from(groupMembers)
      .where(and(inArray(groupMembers.groupId, ids), eq(groupMembers.role, 'member')))
    const modules = [...new Set(enabled.map(e => e.moduleId))]
    const projects = members.length && modules.length
      ? await tx.select({ id: cloudProjects.id, ownerId: cloudProjects.ownerId, learnModule: cloudProjects.learnModule, updatedAt: cloudProjects.updatedAt })
          .from(cloudProjects).where(and(inArray(cloudProjects.ownerId, [...new Set(members.map(m => m.userId))]), inArray(cloudProjects.learnModule, modules)))
      : []
    const progress = await progressOf(tx, projects)

    const result: TeachingProgress = {}
    for (const { groupId, moduleId } of enabled) {
      const userIds = new Set(members.filter(m => m.groupId === groupId).map(m => m.userId))
      const own = projects.filter(p => p.learnModule === moduleId && userIds.has(p.ownerId!) && progress.has(p.id))
      result[groupId] ??= {}
      result[groupId][moduleId] = {
        solved: own.reduce((sum, p) => sum + progress.get(p.id)!.solved.length, 0),
        started: own.length,
      }
    }
    return result
  })
}
