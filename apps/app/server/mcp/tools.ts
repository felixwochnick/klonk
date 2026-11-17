import { codeOf, curriculumFor, isCustomModuleId, LEARN_LANGUAGE_CHOICES, LEARN_STORAGES, LEARN_TRACKS, localize, recommendedModules, TRACK_LANGUAGES, type LearnLanguageChoice, type LearnModule, type LearnStorage } from '@klonk/learn'
import { z } from 'zod'
// Ausdrücklich importiert: der Auto-Import von PROGRAM_LANGUAGES aus shared/ fehlte im Nitro-Bundle (Bundle brach beim Laden ab)
import { collabStarterFiles, PROGRAM_LANGUAGES, type ProgramLanguage } from '../../shared/utils/program-sample'

/**
 * MCP-Werkzeuge der Lern-App: Unterricht (geleitete Klassen), Lernmodule freigeben, Untergruppen (Teams) bilden, Lernstand.
 * Alles läuft über dieselben Funktionen wie die Oberfläche (`server/utils/learn.ts`, `subgroups.ts`) und damit über RLS.
 */
const lang = z.enum(['de', 'en']).default('de').describe('Language for titles and file names (de = German, en = English)')
const classRef = z.string().min(1).describe('Class (group) the teacher leads: its id or its name, e.g. "7a"')
const languageChoice = z.enum(LEARN_LANGUAGE_CHOICES as [LearnLanguageChoice, ...LearnLanguageChoice[]])

/** Dateinamen der Startdateien (wie `project.defaultName.*` in der App) */
const STARTER_NAMES = {
  de: { world: 'welt', blocks: 'programm', klonk: 'programm', javascript: 'main', typescript: 'main', python: 'main', java: 'Main', csharp: 'Program' },
  en: { world: 'world', blocks: 'program', klonk: 'program', javascript: 'main', typescript: 'main', python: 'main', java: 'Main', csharp: 'Program' },
} as const

const normalize = (value: string) => value.trim().toLowerCase()

/** Werkzeuge rund um geleitete Klassen: nur Lehrkräfte und Admins (Betreiber:innen leiten keine Klassen) */
const STAFF: MemberRole[] = ['teacher', 'admin']

/** Geleitete Klasse über ID oder Namen (ohne Untergruppen) */
async function resolveClass(user: SessionUser, ref: string) {
  const { groups } = await teachingOverview(user)
  const found = groups.find(g => g.id === ref) ?? groups.filter(g => normalize(g.name) === normalize(ref)).at(0)
  if (!found) {
    const names = groups.map(g => g.name).join(', ') || '–'
    throw createError({ statusCode: 404, message: `group_not_found – classes you lead: ${names}` })
  }
  return found
}

/** Module über ID, Kürzel (`E4`) oder Titel */
function resolveModules(all: LearnModule[], refs: string[]) {
  const found: LearnModule[] = []
  const unknown: string[] = []
  for (const ref of refs) {
    const key = normalize(ref)
    const module = all.find(m => m.id === ref) ?? all.find(m => normalize(codeOf(m)) === key)
      ?? all.find(m => normalize(m.title.de) === key || normalize(m.title.en) === key)
    if (module) found.push(module)
    else unknown.push(ref)
  }
  if (unknown.length) throw createError({ statusCode: 404, message: `learn_not_found – unknown modules: ${unknown.join(', ')} (use list_learn_modules)` })
  return found
}

type Person = { userId: string, displayName: string, username: string | null }

/** Personen über ID, Benutzernamen (mit/ohne Domain), Anzeigenamen oder eindeutigen Namensanfang */
function resolvePeople(people: Person[], refs: string[]) {
  const ids: string[] = []
  const problems: string[] = []
  for (const ref of refs) {
    const key = normalize(ref)
    const username = key.split('@')[0]
    let matches = people.filter(p => p.userId === ref || (p.username && p.username === username) || normalize(p.displayName) === key)
    if (!matches.length) matches = people.filter(p => normalize(p.displayName).startsWith(key) || normalize(p.displayName).split(/\s+/).includes(key))
    if (matches.length === 1) ids.push(matches[0]!.userId)
    else problems.push(matches.length ? `"${ref}" is ambiguous (${matches.map(m => m.displayName).join(', ')})` : `"${ref}" is not a learner of this class`)
  }
  if (problems.length) throw createError({ statusCode: 400, message: `invalid_input – ${problems.join('; ')}` })
  return [...new Set(ids)]
}

const moduleInfo = (m: LearnModule, l: 'de' | 'en') => ({ id: m.id, code: codeOf(m), title: localize(m.title, l) })

async function classDetails(user: SessionUser, groupId: string, l: 'de' | 'en') {
  const [overview, progress, { modules }] = await Promise.all([subgroupsOverview(user, groupId), groupLearnProgress(user, groupId), visibleLearnModules(user)])
  const byId = new Map(modules.map(m => [m.id, m]))
  return {
    id: overview.id,
    name: overview.name,
    level: progress.level,
    learners: overview.members.filter(m => m.role === 'member').map(({ role: _, ...m }) => m),
    leaders: overview.members.filter(m => m.role === 'leader').map(m => m.displayName),
    subgroups: overview.subgroups.map(s => ({ id: s.id, name: s.name, mode: s.mode, membersCanWrite: s.membersCanWrite, members: s.members.map(m => m.displayName) })),
    releasedModules: progress.modules.map(id => ({ ...(byId.get(id) ? moduleInfo(byId.get(id)!, l) : { id, code: id, title: id }), languages: progress.languages[id] ?? 'both' })),
    learnStorage: progress.storage ?? `organization default (${progress.organizationStorage.join(', ')})`,
  }
}

/** Freigaben einer Klasse setzen (bestehende Sprachvorgaben bleiben, wo nichts Neues kommt) */
async function setReleases(user: SessionUser, groupId: string, next: Map<string, LearnLanguageChoice>, storage?: LearnStorage[] | null) {
  const { modules } = await setGroupLearnModules(user, groupId, [...next].map(([id, languages]) => ({ id, languages })), storage)
  return modules
}

async function currentReleases(user: SessionUser, groupId: string) {
  const progress = await groupLearnProgress(user, groupId)
  return new Map(progress.modules.map(id => [id, (progress.languages[id] ?? 'both') as LearnLanguageChoice]))
}

/** Untergruppe einer Klasse über ID oder Namen */
async function resolveSubgroup(user: SessionUser, classId: string, ref: string) {
  const overview = await subgroupsOverview(user, classId)
  const found = overview.subgroups.find(s => s.id === ref) ?? overview.subgroups.find(s => normalize(s.name) === normalize(ref))
  if (!found) throw createError({ statusCode: 404, message: `group_not_found – subgroups: ${overview.subgroups.map(s => s.name).join(', ') || '–'}` })
  return { overview, subgroup: found }
}

const learnersOf = (overview: SubgroupsOverview) => overview.members.filter(m => m.role === 'member')

export const appMcpTools = [
  whoamiTool,

  defineMcpTool({
    name: 'get_teaching_overview',
    title: 'Teaching overview',
    description: 'Lists the classes (groups) the signed-in teacher leads with grade level, number of learners and released learning modules, plus the school\'s state and school form (used for curriculum recommendations). Start here.',
    access: 'read',
    roles: STAFF,
    input: { lang },
    handler: async ({ lang: l }, { user }) => {
      const [overview, { modules }] = await Promise.all([teachingOverview(user), visibleLearnModules(user)])
      const byId = new Map(modules.map(m => [m.id, m]))
      return {
        school: overview.school,
        isAdmin: overview.admin,
        classes: overview.groups.map(g => ({
          id: g.id,
          name: g.name,
          level: g.level,
          learners: g.members,
          releasedModules: g.modules.map(id => ({ ...(byId.get(id) ? moduleInfo(byId.get(id)!, l) : { id }), languages: g.languages[id] ?? 'both' })),
        })),
        ...(overview.groups.length ? {} : { hint: 'No classes yet. Classes are created in the admin MCP server / admin.klonk (create_group); the teacher becomes their leader.' }),
      }
    },
  }),

  defineMcpTool({
    name: 'list_learn_modules',
    title: 'Learning modules',
    description: 'Catalog of learning modules (built-in and the school\'s own custom modules). Tracks: basics (E, Klonk-Script & blocks, E1–E3 for primary/special-needs schools), advanced (F: Python/Java/JS/TS/C#), sql (S), apps (A: program + database). With `level` (grade, e.g. "7"), modules recommended by the school\'s curriculum are marked.',
    access: 'read',
    input: {
      track: z.enum(LEARN_TRACKS).optional().describe('Only this track'),
      level: z.string().regex(/^\d{1,2}$/).optional().describe('Grade level for curriculum recommendations'),
      recommendedOnly: z.boolean().default(false),
      lang,
    },
    handler: async ({ track, level, recommendedOnly, lang: l }, { user }) => {
      const [{ modules }, overview] = await Promise.all([visibleLearnModules(user), teachingOverview(user)])
      const school = overview.school
      const recommended = new Set(level && school ? recommendedModules(school.state, school.schoolForm, level) : [])
      const curriculum = level && school ? curriculumFor(school.state, school.schoolForm, level).map(e => ({ note: e.note ? localize(e.note, l) : null, modules: e.modules.map(id => codeOf(modules.find(x => x.id === id) ?? { id })) })) : []
      const list = modules
        .filter(m => !track || m.track === track)
        .filter(m => !recommendedOnly || recommended.has(m.id))
        .map(m => ({
          ...moduleInfo(m, l),
          track: m.track,
          summary: localize(m.summary, l),
          tasks: m.tasks.length,
          languages: TRACK_LANGUAGES[m.track],
          prerequisites: (m.prerequisites ?? []).map(id => codeOf(modules.find(x => x.id === id) ?? { id })),
          ...(m.printable ? { printable: true } : {}),
          ...(isCustomModuleId(m.id) ? { custom: true } : {}),
          ...(level ? { recommended: recommended.has(m.id) } : {}),
        }))
      return { modules: list, ...(level ? { curriculum, hasCurriculum: recommended.size > 0 } : {}) }
    },
  }),

  defineMcpTool({
    name: 'get_learn_module',
    title: 'Learning module details',
    description: 'Details of one learning module (by id, code like "E4" or title): objectives, prerequisites, task titles and the notes for teachers (time needed, typical mistakes). Solutions are not included.',
    access: 'read',
    input: { module: z.string().min(1), lang },
    handler: async ({ module: ref, lang: l }, { user }) => {
      const { modules } = await visibleLearnModules(user)
      const [m] = resolveModules(modules, [ref])
      const staff = user.role !== 'member' || user.platformRole !== 'user'
      return {
        ...moduleInfo(m!, l),
        track: m!.track,
        summary: localize(m!.summary, l),
        objectives: m!.objectives.map(o => localize(o, l)),
        prerequisites: (m!.prerequisites ?? []).map(id => codeOf(modules.find(x => x.id === id) ?? { id })),
        languages: TRACK_LANGUAGES[m!.track],
        tasks: m!.tasks.map((t, i) => `${i + 1}. ${localize(t.title, l)}`),
        ...(staff ? { teacherNotes: localize(m!.teacher, l) } : {}),
      }
    },
  }),

  defineMcpTool({
    name: 'get_class',
    title: 'Class details',
    description: 'One class the teacher leads: learners (id, name, username), leaders, subgroups (teams) with members and collaboration mode, released learning modules with language setting and allowed storage.',
    access: 'read',
    roles: STAFF,
    input: { class: classRef, lang },
    handler: async (input, { user }) => classDetails(user, (await resolveClass(user, input.class)).id, input.lang),
  }),

  defineMcpTool({
    name: 'get_learn_progress',
    title: 'Learning progress',
    description: 'Learning progress of a class: for every learner and released module the solved and started tasks (only modules saved in Klonk Cloud are visible).',
    access: 'read',
    roles: STAFF,
    input: { class: classRef, lang },
    handler: async (input, { user }) => {
      const group = await resolveClass(user, input.class)
      const [progress, { modules }] = await Promise.all([groupLearnProgress(user, group.id), visibleLearnModules(user)])
      const byId = new Map(modules.map(m => [m.id, m]))
      return {
        class: progress.name,
        modules: progress.modules.map(id => ({ ...(byId.get(id) ? moduleInfo(byId.get(id)!, input.lang) : { id }), tasks: byId.get(id)?.tasks.length ?? 0 })),
        learners: progress.members.map(m => ({
          name: m.displayName,
          username: m.username,
          modules: Object.fromEntries(Object.entries(m.modules).map(([id, p]) => [byId.get(id) ? codeOf(byId.get(id)!) : id, { solved: p.solved.length, updatedAt: p.updatedAt }])),
        })),
      }
    },
  }),

  defineMcpTool({
    name: 'release_learn_modules',
    title: 'Release learning modules',
    description: 'Releases (enables) learning modules for a class so its learners can start them. Modules by id, code ("E4") or title. Existing releases stay unless `replace` is true. `language` restricts the programming language (both = all languages of the module\'s track; e.g. blocks or klonk for track E). `storage` limits where learners may save (cloud, browser, folder).',
    access: 'write',
    roles: STAFF,
    idempotent: true,
    input: {
      class: classRef,
      modules: z.array(z.string().min(1)).min(1).max(60),
      language: languageChoice.default('both'),
      replace: z.boolean().default(false).describe('true = the given modules become the only released ones'),
      storage: z.array(z.enum(LEARN_STORAGES as [LearnStorage, ...LearnStorage[]])).min(1).max(3).optional(),
      lang,
    },
    handler: async (input, { user }) => {
      const group = await resolveClass(user, input.class)
      const { modules } = await visibleLearnModules(user)
      const wanted = resolveModules(modules, input.modules)
      const next = input.replace ? new Map<string, LearnLanguageChoice>() : await currentReleases(user, group.id)
      for (const m of wanted) next.set(m.id, input.language)
      const released = await setReleases(user, group.id, next, input.storage)
      const byId = new Map(modules.map(m => [m.id, m]))
      return { class: group.name, released: released.map(r => ({ ...moduleInfo(byId.get(r.id)!, input.lang), languages: r.languages })) }
    },
  }),

  defineMcpTool({
    name: 'withdraw_learn_modules',
    title: 'Withdraw learning modules',
    description: 'Removes the release of learning modules for a class. Learners keep the projects they already started, but cannot start the modules anymore.',
    access: 'write',
    roles: STAFF,
    idempotent: true,
    input: { class: classRef, modules: z.array(z.string().min(1)).min(1).max(60), lang },
    handler: async (input, { user }) => {
      const group = await resolveClass(user, input.class)
      const { modules } = await visibleLearnModules(user)
      const remove = new Set(resolveModules(modules, input.modules).map(m => m.id))
      const next = new Map([...(await currentReleases(user, group.id))].filter(([id]) => !remove.has(id)))
      const released = await setReleases(user, group.id, next)
      const byId = new Map(modules.map(m => [m.id, m]))
      return { class: group.name, released: released.map(r => ({ ...moduleInfo(byId.get(r.id)!, input.lang), languages: r.languages })) }
    },
  }),

  defineMcpTool({
    name: 'create_subgroups',
    title: 'Create subgroups (teams)',
    description: 'Creates subgroups (teams) inside a class with the given learners (by name, username or id). Mode "project" = one shared project edited live together; "world" = everyone has an own project and steers an own character in a shared world. `language` sets the starter program of shared projects.',
    access: 'write',
    roles: STAFF,
    input: {
      class: classRef,
      subgroups: z.array(z.object({ name: z.string().trim().min(1).max(60), members: z.array(z.string().min(1)).max(100).default([]) })).min(1).max(30),
      mode: z.enum(COLLAB_MODES).default('project'),
      language: z.enum(PROGRAM_LANGUAGES as [ProgramLanguage, ...ProgramLanguage[]]).default('blocks'),
      lang,
    },
    handler: async (input, { user }) => {
      const group = await resolveClass(user, input.class)
      const overview = await subgroupsOverview(user, group.id)
      const learners = learnersOf(overview)
      const plans = input.subgroups.map(s => ({ name: s.name, memberIds: resolvePeople(learners, s.members) }))
      const files = collabStarterFiles(input.mode, input.language, input.lang, { world: STARTER_NAMES[input.lang].world, program: STARTER_NAMES[input.lang][input.language] })
      const created = []
      for (const plan of plans) {
        const { id } = await createSubgroup(user, group.id, { name: plan.name, mode: input.mode, memberIds: plan.memberIds, files })
        created.push({ id, name: plan.name, members: plan.memberIds.map(uid => learners.find(l => l.userId === uid)!.displayName) })
      }
      return { class: group.name, mode: input.mode, created }
    },
  }),

  defineMcpTool({
    name: 'split_class_into_teams',
    title: 'Split class into teams',
    description: 'Randomly splits the learners of a class into teams (subgroups) of about `teamSize` people (or exactly `teams` teams). By default only learners without a team are distributed. Names are "<namePrefix> 1", "<namePrefix> 2", … (continuing after existing ones).',
    access: 'write',
    roles: STAFF,
    input: {
      class: classRef,
      teamSize: z.number().int().min(2).max(15).optional(),
      teams: z.number().int().min(1).max(30).optional(),
      mode: z.enum(COLLAB_MODES).default('project'),
      language: z.enum(PROGRAM_LANGUAGES as [ProgramLanguage, ...ProgramLanguage[]]).default('blocks'),
      onlyUnassigned: z.boolean().default(true),
      namePrefix: z.string().trim().min(1).max(40).optional().describe('Default: "Team"'),
      lang,
    },
    handler: async (input, { user }) => {
      const group = await resolveClass(user, input.class)
      const overview = await subgroupsOverview(user, group.id)
      const assigned = new Set(overview.subgroups.flatMap(s => s.members.map(m => m.userId)))
      const people = learnersOf(overview).filter(m => !input.onlyUnassigned || !assigned.has(m.userId))
      if (!people.length) throw createError({ statusCode: 400, message: 'invalid_input – no learners left to distribute' })
      // Gleichmäßig verteilen: lieber ein Team weniger als eines mit einer Person allein (wie in der Oberfläche)
      const count = Math.min(people.length, input.teams ?? Math.max(1, Math.round(people.length / (input.teamSize ?? 4))))
      const shuffled = [...people]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
      }
      const teams: typeof people[] = Array.from({ length: count }, () => [])
      shuffled.forEach((p, i) => teams[i % count]!.push(p))

      const prefix = input.namePrefix ?? 'Team'
      const taken = new Set(overview.subgroups.map(s => normalize(s.name)))
      let n = 1
      const nextName = () => {
        while (taken.has(normalize(`${prefix} ${n}`))) n++
        taken.add(normalize(`${prefix} ${n}`))
        return `${prefix} ${n}`
      }
      const files = collabStarterFiles(input.mode, input.language, input.lang, { world: STARTER_NAMES[input.lang].world, program: STARTER_NAMES[input.lang][input.language] })
      const created = []
      for (const team of teams) {
        const name = nextName()
        const { id } = await createSubgroup(user, group.id, { name, mode: input.mode, memberIds: team.map(p => p.userId), files })
        created.push({ id, name, members: team.map(p => p.displayName) })
      }
      return { class: group.name, mode: input.mode, created }
    },
  }),

  defineMcpTool({
    name: 'update_subgroup',
    title: 'Change subgroup',
    description: 'Renames a subgroup (team), changes its collaboration mode, write permission in the shared folder or its members (`members` replaces the member list).',
    access: 'write',
    roles: STAFF,
    idempotent: true,
    input: {
      class: classRef,
      subgroup: z.string().min(1).describe('Subgroup id or name'),
      name: z.string().trim().min(1).max(60).optional(),
      mode: z.enum(COLLAB_MODES).optional(),
      membersCanWrite: z.boolean().optional(),
      members: z.array(z.string().min(1)).max(100).optional(),
    },
    handler: async (input, { user }) => {
      const group = await resolveClass(user, input.class)
      const { overview, subgroup } = await resolveSubgroup(user, group.id, input.subgroup)
      const memberIds = input.members && resolvePeople(learnersOf(overview), input.members)
      await updateSubgroup(user, subgroup.id, { name: input.name, mode: input.mode, membersCanWrite: input.membersCanWrite, memberIds })
      return { ok: true, subgroup: input.name ?? subgroup.name }
    },
  }),

  defineMcpTool({
    name: 'delete_subgroup',
    title: 'Delete subgroup',
    description: 'Deletes a subgroup (team) including its shared folder. Own projects of the members are kept. Cannot be undone.',
    access: 'full',
    roles: STAFF,
    input: { class: classRef, subgroup: z.string().min(1).describe('Subgroup id or name') },
    handler: async (input, { user }) => {
      const group = await resolveClass(user, input.class)
      const { subgroup } = await resolveSubgroup(user, group.id, input.subgroup)
      await deleteSubgroup(user, subgroup.id)
      return { ok: true, deleted: subgroup.name }
    },
  }),
]

export const appMcpServer: KlonkMcpServer = {
  name: 'klonk-app',
  title: 'Klonk',
  instructions: `Klonk is a learning app for programming (characters in a 3D brick world, Klonk-Script, blocks, Python, Java, JS/TS, C#, SQL).
This server helps teachers set up their lessons: classes (German "Klasse", technically groups) the teacher leads, learning modules ("Lernmodule", codes like E4, F2, S1, A1) released per class, subgroups/teams ("Untergruppen") inside a class and learning progress.
Typical flow: get_teaching_overview → list_learn_modules (with level for curriculum recommendations) → release_learn_modules; get_class → split_class_into_teams or create_subgroups.
Accounts and classes themselves (creating classes, adding learners) are managed by the admin MCP server of Klonk (admin.*).
Classes, modules and people may be given by name; ask the user before deleting anything. Answer in the user's language.`,
  tools: appMcpTools,
}
