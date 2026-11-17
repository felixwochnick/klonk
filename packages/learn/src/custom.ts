import { z } from 'zod'
import { translate } from '@klonk/klonk-script'
import { worldSchema, type WorldData } from '@klonk/world'
import { CODE_LANGUAGES, CONSTRUCTS, LEARN_TRACKS, referenceSolution, type CodeSolutions, type Construct, type LearnModule, type LearnTask, type LearnTrack, type TaskCheck, type Text } from './types'

/**
 * Eigene Lernmodule: Lehrkräfte einer Organisation erstellen Module in der App (Unterricht → Eigene Lernmodule). Alle
 * Lehrkräfte der Organisation sehen sie und können sie für ihre Gruppen freigeben, bearbeiten dürfen die Autor:in und die
 * Admins. Gespeichert als JSON-Dokument (`custom_learn_modules.data`) mit der ID `custom-<uuid>` – Freigabe, Modulprojekte
 * und Lernstand laufen wie bei den eingebauten Modulen. Texte gibt es nur in einer Sprache (`lang`), Klonk-Script-Lösungen
 * werden in die andere Sprache übersetzt.
 */

export const CUSTOM_MODULE_PREFIX = 'custom-'
export const isCustomModuleId = (id: string) => id.startsWith(CUSTOM_MODULE_PREFIX)
/** Größe eines Moduls als JSON – Welten und Datenbanken machen den Großteil aus */
export const CUSTOM_MODULE_MAX_BYTES = 2_000_000
export const CUSTOM_LIMITS = { tasks: 40, worlds: 8, databases: 4, scenarios: 8, hints: 10, objectives: 20 }
/** Name einer Aufgabendatenbank: Dateiname (`<name>.sqlite.sql`) und Name für `Database.open` */
export const DATABASE_NAME = /^[\p{L}\p{N}_-]{1,40}$/u

/** Bausteine, die eine Aufgabe je Reihe verlangen kann (Prüfung am Syntaxbaum, an der Diagramm-Auswertung bzw. am SQL-Text) */
export const TRACK_CONSTRUCTS: Record<LearnTrack, Construct[]> = {
  basics: ['repeatTimes', 'repeatWhile', 'if', 'procedure', 'function', 'variable', 'recursion'],
  advanced: ['loop', 'if', 'method', 'returnValue', 'class', 'inheritance', 'recursion'],
  sql: ['groupBy', 'subquery'],
  apps: ['loop', 'if', 'method', 'returnValue', 'class', 'inheritance', 'recursion'],
}
/** Prüfungen je Reihe (SQL-Aufgaben über die Welt als Datenbank gibt es in eigenen Modulen nicht) */
export const TRACK_CHECKS: Record<LearnTrack, (keyof TaskCheck)[]> = {
  basics: ['position', 'direction', 'cells', 'output'],
  advanced: ['position', 'direction', 'cells', 'output'],
  sql: ['result', 'tables', 'schema'],
  apps: ['position', 'direction', 'cells', 'output', 'tables'],
}
/** Welten: Reihe E und F brauchen mindestens eine, A darf ohne (nur Datenbank), S hat keine */
export const tracksWithWorlds = (track: LearnTrack) => track !== 'sql'
export const tracksWithDatabases = (track: LearnTrack) => track === 'sql' || track === 'apps'

const line = (max: number) => z.string().trim().max(max)
const long = (max: number) => z.string().max(max)
const code = long(50_000).optional()
const tableName = z.string().trim().min(1).max(64)

export const customTaskSchema = z.object({
  /** Beim Anlegen vergeben (Teil der URL, Schlüssel im Manifest der Modulprojekte) – nie ändern */
  id: z.string().regex(/^[a-z0-9]{1,16}$/),
  title: line(200),
  text: long(20_000),
  hints: z.array(long(2_000)).max(CUSTOM_LIMITS.hints).default([]),
  worlds: z.array(worldSchema).max(CUSTOM_LIMITS.worlds).default([]),
  databases: z.array(z.object({
    name: z.string().regex(DATABASE_NAME),
    /** SQL je Startsituation – mehrere verhindern abgezählte Lösungen */
    sql: z.array(long(200_000)).min(1).max(CUSTOM_LIMITS.scenarios),
  })).max(CUSTOM_LIMITS.databases).default([]),
  /** Musterlösung in Klonk-Script (Reihe E, deutsch oder englisch) bzw. SQL (Reihe S) */
  solution: long(50_000).default(''),
  /** Musterlösungen der Reihen F und A – mindestens eine Sprache, JavaScript bzw. die erste liefert den Zielzustand */
  solutions: z.object({ python: code, java: code, javascript: code, typescript: code, csharp: code }).default({}),
  check: z.object({
    position: z.boolean().optional(),
    direction: z.boolean().optional(),
    cells: z.boolean().optional(),
    output: z.enum(['numbers', 'lines']).optional(),
    result: z.enum(['ordered', 'unordered']).optional(),
    tables: z.array(tableName).max(10).optional(),
    schema: z.array(tableName).max(10).optional(),
  }).default({}),
  requires: z.array(z.enum(CONSTRUCTS)).max(CONSTRUCTS.length).default([]),
  /** Figuren, die die Aufgabe höchstens braucht (Programme erstellen weitere) */
  characters: z.number().int().min(1).max(32).optional(),
})

export const customModuleSchema = z.object({
  version: z.literal(1),
  /** Sprache der Texte – Lernende sehen sie unabhängig von der Oberfläche */
  lang: z.enum(['de', 'en']),
  track: z.enum(LEARN_TRACKS),
  /** Kürzel, z. B. „M1“ (frei, darf leer bleiben) */
  code: line(8).default(''),
  title: line(120),
  summary: long(500).default(''),
  objectives: z.array(long(500)).max(CUSTOM_LIMITS.objectives).default([]),
  intro: long(50_000).default(''),
  /** Hinweise für Lehrkräfte – sehen Lernende nicht */
  teacher: long(20_000).default(''),
  /** Jahrgangsstufen (`'5'` …, `'courses'`), zu denen das Modul passt – Unterricht zeigt es dort als passend */
  levels: z.array(z.string().regex(/^(\d{1,2}|courses)$/)).max(20).default([]),
  tasks: z.array(customTaskSchema).max(CUSTOM_LIMITS.tasks).default([]),
}).superRefine((data, ctx) => {
  const ids = new Set<string>()
  data.tasks.forEach((task, i) => {
    if (ids.has(task.id)) ctx.addIssue({ code: 'custom', path: ['tasks', i, 'id'], message: 'duplicate' })
    ids.add(task.id)
  })
})

export type CustomModuleData = z.infer<typeof customModuleSchema>
export type CustomTaskData = CustomModuleData['tasks'][number]

/** Modul aus Daten (z. B. vom Server) prüfen – ungültig ⇒ `null` */
export function parseCustomModule(data: unknown): CustomModuleData | null {
  const result = customModuleSchema.safeParse(data)
  return result.success ? result.data : null
}

/** Neue, zufällige Aufgaben-ID (eindeutig im Modul) */
export function newTaskId(existing: { id: string }[]) {
  let id: string
  do id = Math.random().toString(36).slice(2, 10)
  while (!id || existing.some(t => t.id === id))
  return id
}

/** Startwelt für neue Aufgaben: 6 × 6 Felder, Figur oben links mit Blick nach Süden */
export function emptyTaskWorld(): WorldData {
  return { version: 1, size: { width: 6, depth: 6, height: 6 }, cells: [], characters: [{ id: 'Klonk', model: 'male', x: 0, z: 0, direction: 'south' }] }
}

/** Startdatenbank neuer SQL-/Anwendungs-Aufgaben */
const STARTER_DATABASE: Text = {
  de: `CREATE TABLE schueler (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  klasse TEXT\n);\nINSERT INTO schueler (name, klasse) VALUES\n  ('Mia', '7a'),\n  ('Ben', '7b');\n`,
  en: `CREATE TABLE students (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  class TEXT\n);\nINSERT INTO students (name, class) VALUES\n  ('Mia', '7a'),\n  ('Ben', '7b');\n`,
}

/** Neue Aufgabe passend zur Reihe (Welt bzw. Datenbank, übliche Prüfung) */
export function newCustomTask(track: LearnTrack, lang: 'de' | 'en', existing: { id: string }[] = []): CustomTaskData {
  const sql = track === 'sql'
  return {
    id: newTaskId(existing),
    title: '',
    text: '',
    hints: [],
    worlds: tracksWithWorlds(track) && track !== 'apps' ? [emptyTaskWorld()] : [],
    databases: tracksWithDatabases(track) ? [{ name: lang === 'de' ? 'schule' : 'school', sql: [STARTER_DATABASE[lang]] }] : [],
    solution: '',
    solutions: {},
    check: sql ? { result: 'unordered' } : track === 'apps' ? { output: 'lines' } : { position: true, cells: true },
    requires: [],
  }
}

/** Neues Modul einer Reihe mit einer ersten Aufgabe */
export function newCustomModule(track: LearnTrack, lang: 'de' | 'en', title: string): CustomModuleData {
  return { version: 1, lang, track, code: '', title, summary: '', objectives: [], intro: '', teacher: '', levels: [], tasks: [newCustomTask(track, lang)] }
}

const same = (value: string): Text => ({ de: value, en: value })

/** Klonk-Script in beiden Sprachen (Schlüsselwörter übersetzt; nicht lesbar ⇒ unverändert, die Prüfung meldet es) */
function klonkText(source: string): Text {
  try {
    return { de: translate(source, 'de'), en: translate(source, 'en') }
  }
  catch {
    return same(source)
  }
}

/** Nur Prüfungen, die zur Reihe passen (z. B. nach einem Wechsel der Reihe) */
function trackCheck(track: LearnTrack, check: CustomTaskData['check']): TaskCheck {
  const allowed = TRACK_CHECKS[track]
  return Object.fromEntries(Object.entries(check).filter(([key, value]) =>
    allowed.includes(key as keyof TaskCheck) && value !== undefined && value !== false && !(Array.isArray(value) && !value.length))) as TaskCheck
}

function codeSolutions(solutions: CustomTaskData['solutions']): CodeSolutions {
  return Object.fromEntries(CODE_LANGUAGES.flatMap(l => (solutions[l]?.trim() ? [[l, solutions[l]]] : []))) as CodeSolutions
}

/** Aufgabe eines eigenen Moduls im Format der eingebauten */
export function customTask(task: CustomTaskData, track: LearnTrack): LearnTask {
  const requires = task.requires.filter(c => TRACK_CONSTRUCTS[track].includes(c))
  return {
    id: task.id,
    title: same(task.title),
    text: same(task.text),
    hints: task.hints.filter(h => h.trim()).map(same),
    worlds: tracksWithWorlds(track) ? task.worlds as WorldData[] : [],
    ...(tracksWithDatabases(track) && task.databases.length
      ? { databases: task.databases.map(db => ({ name: db.name, sql: db.sql.length === 1 ? db.sql[0]! : db.sql })) }
      : {}),
    ...(track === 'basics' ? { solution: klonkText(task.solution) } : track === 'sql' ? { solution: same(task.solution) } : { solutions: codeSolutions(task.solutions) }),
    check: trackCheck(track, task.check),
    ...(requires.length ? { requires } : {}),
    ...(task.characters ? { characters: task.characters } : {}),
  }
}

/** Eigenes Modul im Format der eingebauten (`revision` = Stand, z. B. Zeitpunkt der letzten Änderung) */
export function customModule(id: string, data: CustomModuleData, revision?: string): LearnModule {
  return {
    id,
    track: data.track,
    code: data.code,
    ...(revision ? { revision } : {}),
    title: same(data.title),
    summary: same(data.summary),
    objectives: data.objectives.filter(o => o.trim()).map(same),
    intro: same(data.intro),
    teacher: same(data.teacher),
    tasks: data.tasks.map(task => customTask(task, data.track)),
  }
}

/** Was einem Modul noch fehlt, damit Lernende es bearbeiten können (`task` = Index der Aufgabe) */
export type CustomModuleProblem = { code: 'title' | 'tasks' | 'task_title' | 'task_text' | 'task_world' | 'task_character' | 'task_database' | 'task_solution' | 'task_check', task?: number }

export function customModuleProblems(data: CustomModuleData): CustomModuleProblem[] {
  const problems: CustomModuleProblem[] = []
  if (!data.title.trim()) problems.push({ code: 'title' })
  if (!data.tasks.length) problems.push({ code: 'tasks' })
  data.tasks.forEach((task, i) => {
    const add = (code: CustomModuleProblem['code']) => problems.push({ code, task: i })
    if (!task.title.trim()) add('task_title')
    if (!task.text.trim()) add('task_text')
    if (tracksWithWorlds(data.track) && data.track !== 'apps' && !task.worlds.length) add('task_world')
    // Roboterprogramme steuern Figuren – ohne Figur scheitert schon die Musterlösung
    if ((data.track === 'basics' || data.track === 'advanced') && task.worlds.some(w => !w.characters.length)) add('task_character')
    if (data.track === 'sql' && !task.databases.length) add('task_database')
    const solved = data.track === 'basics' || data.track === 'sql' ? !!task.solution.trim() : !!referenceSolution(task.solutions)
    if (!solved) add('task_solution')
    if (!Object.keys(trackCheck(data.track, task.check)).length) add('task_check')
  })
  return problems
}

/** Eintrag in Listen (Lernen, Unterricht): alles außer Welten, Lösungen und Texten */
export type CustomModuleSummary = {
  id: string
  track: LearnTrack
  code: string
  title: string
  summary: string
  lang: 'de' | 'en'
  levels: string[]
  tasks: { id: string, title: string }[]
  /** Keine offenen Probleme ⇒ lässt sich freigeben */
  ready: boolean
  /** Anzeigename der Autor:in (Konto gelöscht ⇒ null) */
  author: string | null
  mine: boolean
  /** Autor:in oder Admin der Organisation */
  editable: boolean
  updatedAt: string
}

/** GET /api/learn/custom/:id – ganzes Modul */
export type CustomModuleEntry = CustomModuleSummary & { data: CustomModuleData }

export function customSummary(id: string, data: CustomModuleData, meta: Pick<CustomModuleSummary, 'author' | 'mine' | 'editable' | 'updatedAt'>): CustomModuleSummary {
  return {
    id,
    track: data.track,
    code: data.code,
    title: data.title,
    summary: data.summary,
    lang: data.lang,
    levels: data.levels,
    tasks: data.tasks.map(t => ({ id: t.id, title: t.title })),
    ready: !customModuleProblems(data).length,
    ...meta,
  }
}

/**
 * Modul für Übersichten (Karten, Freigabe-Matrix, Lernstand): eingebaute Module oder die Zusammenfassung eines eigenen –
 * Aufgaben nur mit ID und Titel
 */
export type LearnModuleInfo = Pick<LearnModule, 'id' | 'track' | 'code' | 'title' | 'summary'> & { tasks: { id: string, title: Text }[] }

export function summaryInfo(summary: CustomModuleSummary): LearnModuleInfo {
  return {
    id: summary.id,
    track: summary.track,
    code: summary.code,
    title: same(summary.title),
    summary: same(summary.summary),
    tasks: summary.tasks.map(t => ({ id: t.id, title: same(t.title) })),
  }
}
