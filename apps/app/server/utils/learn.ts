import type { H3Event } from 'h3'
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { choiceLanguages, CUSTOM_MODULE_MAX_BYTES, customModule, customSummary, findModule, isCustomModuleId, LEARN_MODULES, LEARN_STORAGES, learnProjectName, learnStorages, moduleProjectFiles, parseCustomModule, progressFromFiles, TRACK_LANGUAGES, type CustomModuleData, type CustomModuleEntry, type LearnGroupProgress, type LearnLanguage, type LearnLanguageChoice, type LearnModule, type LearnModuleProgress, type LearnStatus, type LearnStorage, type TeachingOverview, type TeachingProgress } from '@klonk/learn'

type Tx = Parameters<Parameters<typeof withUserDb>[1]>[0]
const { cloudFiles, cloudProjects, customLearnModules, groupLearnModules, groupMembers, groups, organizations, users } = schema

/** Eigenes Modul aus der Datenbank (Daten geprüft) */
type CustomRow = { id: string, organizationId: string, createdBy: string | null, author: string | null, updatedAt: Date, data: CustomModuleData }

/**
 * Eigene Module, die das Konto sehen darf (RLS: Lehrkräfte/Admins der Organisation alle, Lernende die freigegebenen),
 * nach Titel sortiert; ungültige Daten werden übergangen. `ids` schränkt ein.
 */
async function customRows(tx: Tx, ids?: string[]): Promise<CustomRow[]> {
  const wanted = ids?.filter(isCustomModuleId)
  if (wanted && !wanted.length) return []
  const rows = await tx.select({
    id: customLearnModules.id,
    organizationId: customLearnModules.organizationId,
    createdBy: customLearnModules.createdBy,
    updatedAt: customLearnModules.updatedAt,
    data: customLearnModules.data,
    // Lernende sehen nur sich selbst in `users` ⇒ dort ohne Namen
    author: users.displayName,
  }).from(customLearnModules).leftJoin(users, eq(users.id, customLearnModules.createdBy))
    .where(wanted ? inArray(customLearnModules.id, wanted) : undefined)
  return rows.flatMap((row) => {
    const data = parseCustomModule(row.data)
    return data ? [{ ...row, data }] : []
  }).sort((a, b) => a.data.title.localeCompare(b.data.title))
}

const asModule = (row: CustomRow) => customModule(row.id, row.data, row.updatedAt.toISOString())
/** Autor:in (weiterhin Lehrkraft/Admin) oder Admin der Organisation – wie `klonk.can_edit_custom_module` */
const canEdit = (user: SessionUser, row: CustomRow) => user.organizationId === row.organizationId && user.role !== 'member'
  && (row.createdBy === user.id || user.role === 'admin')
const summaryOf = (user: SessionUser, row: CustomRow) => customSummary(row.id, row.data, {
  author: row.author,
  mine: row.createdBy === user.id,
  editable: canEdit(user, row),
  updatedAt: row.updatedAt.toISOString(),
})

/** Module zu IDs: eingebaute und (soweit sichtbar) eigene */
async function modulesById(tx: Tx, ids: Iterable<string>) {
  const result = new Map<string, LearnModule>()
  const unique = [...new Set(ids)]
  for (const id of unique) {
    const module = findModule(id)
    if (module) result.set(id, module)
  }
  for (const row of await customRows(tx, unique)) result.set(row.id, asModule(row))
  return result
}

/** Modul-IDs in Anzeige-Reihenfolge: eingebaute in Kursreihenfolge, danach eigene (unbekannte fallen weg, jede ID einmal) */
function orderedIds(ids: Iterable<string>, custom: { id: string }[] = []) {
  const set = new Set(ids)
  return [...new Set([...LEARN_MODULES, ...custom].map(m => m.id))].filter(id => set.has(id))
}

/** Lernstand der Modulprojekte (RLS: eigene bzw. die der geleiteten Gruppen); `modules` = die betroffenen Module */
async function progressOf(tx: Tx, projects: { id: string, learnModule: string | null, updatedAt: Date }[], modules: Map<string, LearnModule>) {
  const ids = projects.map(p => p.id)
  const files = ids.length
    ? await tx.select({ projectId: cloudFiles.projectId, path: cloudFiles.path, content: cloudFiles.content })
        .from(cloudFiles).where(and(inArray(cloudFiles.projectId, ids), eq(cloudFiles.deleted, false), eq(cloudFiles.folder, false)))
    : []
  const result = new Map<string, LearnModuleProgress>()
  for (const project of projects) {
    const module = modules.get(project.learnModule ?? '')
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
 * Startbare Module mit erlaubten Sprachen und Speicherorten: Privatkonten und Lehrkräfte/Admins alle mit allen Sprachen
 * der Reihe und den Orten der Organisation, Lernende einer Organisation nur in einer ihrer Gruppen freigegebene (Sprachen und Orte
 * aller Freigaben zusammen, Orte nie über die Organisation hinaus)
 */
async function allowedModules(tx: Tx, user: SessionUser, modules: LearnModule[]) {
  const orgStorage = await organizationStorage(tx, user.organizationId)
  const all = new Map<string, Allowed>(modules.map(m => [m.id, { languages: [...TRACK_LANGUAGES[m.track]], storage: orgStorage }]))
  if (!user.organizationId || user.role !== 'member') return all
  const rows = await tx.select({ moduleId: groupLearnModules.moduleId, languages: groupLearnModules.languages, storage: groups.learnStorage }).from(groupLearnModules)
    .innerJoin(groupMembers, eq(groupMembers.groupId, groupLearnModules.groupId))
    .innerJoin(groups, eq(groups.id, groupLearnModules.groupId))
    .where(eq(groupMembers.userId, user.id))
  const allowed = new Map<string, Allowed>()
  for (const module of modules) {
    const releases = rows.filter(r => r.moduleId === module.id)
    if (!releases.length) continue
    const choices = releases.flatMap(r => choiceLanguages(r.languages, module.track))
    allowed.set(module.id, {
      languages: TRACK_LANGUAGES[module.track].filter(l => choices.includes(l)),
      storage: orgStorage.filter(s => releases.some(r => (r.storage ?? orgStorage).includes(s))),
    })
  }
  return allowed
}

export async function learnStatus(user: SessionUser, event: H3Event): Promise<LearnStatus> {
  const cloud = await cloudEnabled(user, event)
  const restricted = !!user.organizationId && user.role === 'member'
  return withUserDb(user.id, async (tx) => {
    const custom = await customRows(tx)
    const all = [...LEARN_MODULES, ...custom.map(asModule)]
    const allowed = await allowedModules(tx, user, all)
    const modules = [...allowed.keys()]

    const own = await tx.select({ id: cloudProjects.id, learnModule: cloudProjects.learnModule, updatedAt: cloudProjects.updatedAt })
      .from(cloudProjects).where(and(eq(cloudProjects.ownerId, user.id), isNotNull(cloudProjects.learnModule)))
    const progress = await progressOf(tx, own, new Map(all.map(m => [m.id, m])))

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
        modules: orderedIds(enabled.filter(e => e.groupId === g.id).map(e => e.moduleId), custom),
        members: counts.find(c => c.groupId === g.id)?.n ?? 0,
      })),
      custom: custom.map(row => summaryOf(user, row)),
    }
  })
}

/**
 * Modul in der Cloud starten: eigenes Cloud-Projekt anlegen (oder das schon begonnene liefern); lokal legt der Browser es an.
 * `language` = gewünschte Sprache der Programme (sonst die erste erlaubte).
 */
export async function startLearnModule(user: SessionUser, moduleId: string, lang: 'de' | 'en', language?: LearnLanguage) {
  return withUserDb(user.id, async (tx) => {
    const module = (await modulesById(tx, [moduleId])).get(moduleId)
    if (!module?.tasks.length) throw createError({ statusCode: 404, message: 'learn_not_found' })
    const [started] = await tx.select().from(cloudProjects)
      .where(and(eq(cloudProjects.ownerId, user.id), eq(cloudProjects.learnModule, moduleId)))
    if (started) return started
    const [ok] = await tx.execute<{ ok: boolean }>(sql`select klonk.can_start_learn_module(${moduleId}) as ok`)
    if (!ok?.ok) throw createError({ statusCode: 403, message: 'learn_not_enabled' })

    const allowed = (await allowedModules(tx, user, [module])).get(moduleId)
    if (!allowed?.storage.includes('cloud')) throw createError({ statusCode: 403, message: 'learn_storage' })

    // Je Aufgabe ein Ordner mit Aufgabentext, Welt(en), Datenbanken und Programm in der gewünschten bzw. ersten erlaubten Sprache
    const first = language && allowed.languages.includes(language) ? language : allowed.languages[0] ?? TRACK_LANGUAGES[module.track][0]!
    const { folders, files } = moduleProjectFiles(module, lang, first)
    return createCloudProject(tx, user, {
      name: learnProjectName(module, lang),
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
  return withUserDb(user.id, async (tx) => {
    const [lead] = await tx.execute<{ ok: boolean }>(sql`select klonk.leads_group(${groupId}) as ok`)
    if (!lead?.ok) throw createError({ statusCode: 403, message: 'forbidden' })
    // Nur bekannte bzw. sichtbare eigene Module; Vorgabe muss zur Reihe passen (sonst alle Sprachen der Reihe)
    const known = await modulesById(tx, modules.map(m => m.id))
    const valid = modules.flatMap((m) => {
      const module = known.get(m.id)
      if (!module) return []
      return [{ id: m.id, languages: m.languages !== 'both' && TRACK_LANGUAGES[module.track].includes(m.languages) && TRACK_LANGUAGES[module.track].length > 1 ? m.languages : 'both' as const }]
    })
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
    const known = await modulesById(tx, rows.map(r => r.moduleId))
    const modules = orderedIds(known.keys(), [...known.values()].filter(m => isCustomModuleId(m.id)))
    const members = await tx.select({ userId: users.id, displayName: users.displayName, username: users.username })
      .from(groupMembers).innerJoin(users, eq(users.id, groupMembers.userId))
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.role, 'member'))).orderBy(asc(users.displayName))

    const projects = members.length && modules.length
      ? await tx.select({ id: cloudProjects.id, ownerId: cloudProjects.ownerId, learnModule: cloudProjects.learnModule, updatedAt: cloudProjects.updatedAt })
          .from(cloudProjects).where(and(inArray(cloudProjects.ownerId, members.map(m => m.userId)), inArray(cloudProjects.learnModule, modules)))
      : []
    const progress = await progressOf(tx, projects, known)

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
    const custom = await customRows(tx, enabled.map(e => e.moduleId))
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
          modules: orderedIds(rows.map(r => r.moduleId), custom),
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
    const progress = await progressOf(tx, projects, await modulesById(tx, modules))

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

// --- Eigene Lernmodule -----------------------------------------------------

/** Daten prüfen: Schema und Größe (Welten, Datenbanken) */
function validCustomData(data: unknown) {
  const parsed = parseCustomModule(data)
  if (!parsed) throw createError({ statusCode: 400, message: 'invalid_input' })
  if (Buffer.byteLength(JSON.stringify(parsed)) > CUSTOM_MODULE_MAX_BYTES) throw createError({ statusCode: 413, message: 'custom_module_too_large' })
  return parsed
}

/** Lehrkräfte und Admins einer Organisation (Privatkonten und Lernende nicht – RLS prüft zusätzlich) */
function requireStaff(user: SessionUser) {
  if (!user.organizationId || user.role === 'member') throw createError({ statusCode: 403, message: 'forbidden' })
  return user.organizationId
}

async function customEntry(tx: Tx, user: SessionUser, id: string): Promise<CustomModuleEntry> {
  const [row] = await customRows(tx, [id])
  if (!row) throw createError({ statusCode: 404, message: 'learn_not_found' })
  return { ...summaryOf(user, row), data: row.data }
}

/** Ganzes eigenes Modul (Lernansicht, Bearbeiten) – RLS: Lehrkräfte der Organisation bzw. Lernende mit Freigabe */
export function getCustomModule(user: SessionUser, id: string) {
  return withUserDb(user.id, tx => customEntry(tx, user, id))
}

export async function createCustomModule(user: SessionUser, data: unknown) {
  const organizationId = requireStaff(user)
  const parsed = validCustomData(data)
  return withUserDb(user.id, async (tx) => {
    const [row] = await tx.insert(customLearnModules).values({ organizationId, createdBy: user.id, updatedBy: user.id, data: parsed })
      .returning({ id: customLearnModules.id })
    return customEntry(tx, user, row!.id)
  })
}

/**
 * Speichern (Autor:in, Admins). `base` = Stand, auf dem die Änderung beruht – hat inzwischen jemand anderes gespeichert,
 * schlägt es fehl (`custom_module_conflict`), statt fremde Änderungen zu überschreiben.
 */
export async function updateCustomModule(user: SessionUser, id: string, data: unknown, base?: string) {
  requireStaff(user)
  const parsed = validCustomData(data)
  return withUserDb(user.id, async (tx) => {
    const current = await customEntry(tx, user, id)
    if (!current.editable) throw createError({ statusCode: 403, message: 'forbidden' })
    if (base && base !== current.updatedAt) throw createError({ statusCode: 409, message: 'custom_module_conflict' })
    const [row] = await tx.update(customLearnModules).set({ data: parsed, updatedBy: user.id, updatedAt: new Date() })
      .where(eq(customLearnModules.id, id)).returning({ id: customLearnModules.id })
    if (!row) throw createError({ statusCode: 403, message: 'forbidden' })
    return customEntry(tx, user, id)
  })
}

/** Löschen (Autor:in, Admins) – Freigaben entfernt die Datenbank, Modulprojekte der Lernenden bleiben */
export async function deleteCustomModule(user: SessionUser, id: string) {
  requireStaff(user)
  return withUserDb(user.id, async (tx) => {
    const [row] = await tx.delete(customLearnModules).where(eq(customLearnModules.id, id)).returning({ id: customLearnModules.id })
    if (!row) throw createError({ statusCode: 404, message: 'learn_not_found' })
    return { ok: true }
  })
}
