import { databaseSql } from './check'
import type { CustomModuleSummary } from './custom'
import { codeOf, findModule } from './registry'
import { CODE_LANGUAGES, localize, type CodeLanguage, type LearnModule, type LearnTask, type LearnTrack } from './types'

/**
 * Lernmodule: jedes gestartete Modul ist ein eigenes Projekt – in der Klonk Cloud, im Browser oder in einem Ordner auf
 * dem Rechner (`LearnStorage`). Je Aufgabe ein Ordner, z. B. `1 Zur Marke/` mit `Aufgabe.md`, Startwelt(en)
 * `Welt.klonkworld.json`, Datenbanken `<name>.sqlite.sql` und dem Programm (`Programm.blocks`, `Programm.py`, `Abfrage.sql` …).
 * Im Manifest `klonk.json` stehen die Ordner der Aufgaben, die Sprache je Aufgabe und der Lernstand.
 */

export const LEARN_MANIFEST = 'klonk.json'

/** Sprachen, in denen Aufgaben gelöst werden */
export type LearnLanguage = 'blocks' | 'klonk' | CodeLanguage | 'sql'
/** Sprachen je Reihe: E Blöcke und Klonk-Script, F und A die Programmiersprachen, S SQL */
export const TRACK_LANGUAGES: Record<LearnTrack, LearnLanguage[]> = {
  basics: ['blocks', 'klonk'],
  advanced: [...CODE_LANGUAGES],
  sql: ['sql'],
  apps: [...CODE_LANGUAGES],
}
export const ALL_LEARN_LANGUAGES: LearnLanguage[] = ['blocks', 'klonk', ...CODE_LANGUAGES, 'sql']
/** Dateiendung des Programms je Sprache */
export const LEARN_EXTENSIONS: Record<LearnLanguage, string> = { blocks: 'blocks', klonk: 'klonk', python: 'py', java: 'java', javascript: 'js', typescript: 'ts', csharp: 'cs', sql: 'sql' }

/** Sprachvorgabe der Gruppenleitung je Modul: `both` = alle Sprachen der Reihe (historischer Name aus Reihe E) */
export type LearnLanguageChoice = 'both' | LearnLanguage
export const LEARN_LANGUAGE_CHOICES: LearnLanguageChoice[] = ['both', ...ALL_LEARN_LANGUAGES]
/** Wählbare Vorgaben einer Reihe (SQL: nur eine Sprache ⇒ keine Wahl) */
export const languageChoices = (track: LearnTrack): LearnLanguageChoice[] => (TRACK_LANGUAGES[track].length > 1 ? ['both', ...TRACK_LANGUAGES[track]] : ['both'])
/** Sprachen einer Vorgabe; passt sie nicht zur Reihe, gelten alle Sprachen der Reihe */
export function choiceLanguages(choice: LearnLanguageChoice, track: LearnTrack = 'basics'): LearnLanguage[] {
  const all = TRACK_LANGUAGES[track]
  return choice !== 'both' && all.includes(choice) ? [choice] : [...all]
}

/**
 * Speicherort eines Modulprojekts: Klonk Cloud (Lernstand für die Gruppenleitung, alle Geräte), Browser (OPFS) oder Ordner
 * auf dem Rechner. Erlaubt sind sie je Organisation, die Gruppenleitung kann sie für ihre Gruppe weiter einschränken.
 */
export type LearnStorage = 'cloud' | 'browser' | 'folder'
export const LEARN_STORAGES: LearnStorage[] = ['cloud', 'browser', 'folder']
/** Gültige Speicherorte in fester Reihenfolge (z. B. aus der Datenbank) */
export const learnStorages = (values: readonly unknown[] | null | undefined): LearnStorage[] => LEARN_STORAGES.filter(s => values?.includes(s))

export type LearnManifest = {
  module: string
  /** Programm je Aufgabe ohne Endung, z. B. `1 Zur Marke/Programm` (ältere Projekte: fehlt ⇒ `<aufgabe>`) */
  tasks: Record<string, string>
  /** Zuletzt gewählte Sprache je Aufgabe */
  languages: Record<string, LearnLanguage>
  /** Gelöste Aufgaben mit Zeitpunkt (ISO) */
  solved: Record<string, string>
}

export function emptyManifest(moduleId: string): LearnManifest {
  return { module: moduleId, tasks: {}, languages: {}, solved: {} }
}

const record = <T>(value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, T> : {})

/** Manifest aus `klonk.json` lesen (fehlerhaft/fremd ⇒ leer) */
export function parseManifest(text: string | null | undefined, moduleId: string): LearnManifest {
  try {
    const learn = (JSON.parse(text ?? '') as { learn?: Partial<LearnManifest> }).learn
    if (!learn || learn.module !== moduleId) return emptyManifest(moduleId)
    return { module: moduleId, tasks: record<string>(learn.tasks), languages: record<LearnLanguage>(learn.languages), solved: record<string>(learn.solved) }
  }
  catch {
    return emptyManifest(moduleId)
  }
}

/**
 * `klonk.json` des Modulprojekts mit Lernstand. Reihe E ist ein Projekt der Art Klonk-Script & Blöcke, die übrigen sind
 * gemischt (Sprache je Aufgabe wählbar). Eigene Module kennt das Paket nicht ⇒ Reihe mitgeben.
 */
export function serializeManifest(manifest: LearnManifest, track: LearnTrack = findModule(manifest.module)?.track ?? 'basics') {
  return `${JSON.stringify({ ...(track === 'basics' ? { language: 'klonk' } : {}), learn: manifest }, null, 2)}\n`
}

/** Programmdatei einer Aufgabe (ohne Ordner-Eintrag im Manifest: alte Ablage im Projektordner) */
export const taskFile = (manifest: LearnManifest, taskId: string, language: LearnLanguage) => `${manifest.tasks[taskId] ?? taskId}.${LEARN_EXTENSIONS[language]}`

const LABELS = {
  de: { module: 'Lernmodul', program: 'Programm', query: 'Abfrage', world: 'Welt', text: 'Aufgabe', hint: 'Tipp', check: 'Prüfen in Klonk unter **Lernen**.' },
  en: { module: 'Learning module', program: 'Program', query: 'Query', world: 'World', text: 'Task', hint: 'Hint', check: 'Check it in Klonk under **Learn**.' },
}

/** Name ohne Zeichen, die in Cloud-Pfaden nicht erlaubt sind (`:` u. a.) */
const safeName = (text: string) => text.replace(/:\s*/g, ' – ').replace(/[\\/*?"<>|]/g, '').trim()

/** Name des Cloud-Projekts, z. B. „Lernmodul E4 – Erste Schritte – Anweisungen“ (eigene Module ohne Kürzel: „Lernmodul – …“) */
export function learnProjectName(module: LearnModule, lang: 'de' | 'en') {
  const code = safeName(codeOf(module))
  return `${LABELS[lang].module}${code ? ` ${code}` : ''} – ${safeName(module.title[lang])}`
}

/** Name des Programms im Aufgabenordner (ohne Endung) – in Java zugleich der Klassenname */
export const programName = (track: LearnTrack, lang: 'de' | 'en') => (track === 'sql' ? LABELS[lang].query : LABELS[lang].program)

/**
 * Startinhalt des Programms: Klonk-Script, Blöcke und SQL leer, die Programmiersprachen mit Import und einer Figur
 * (Reihe A zusätzlich mit der Datenbank-API). Ein Programm, das noch so aussieht, gilt als nicht begonnen.
 */
export function starterSource(language: LearnLanguage, track: LearnTrack, lang: 'de' | 'en') {
  const db = track === 'apps'
  switch (language) {
    case 'python':
      return `from klonk import Klonk${db ? ', Database' : ''}\n\nklonk = Klonk()\n`
    case 'javascript':
    case 'typescript':
      return `import { Klonk${db ? ', Database' : ''} } from 'klonk'\n\nconst klonk = new Klonk()\n`
    case 'java':
      return `import klonk.Klonk;
${db ? 'import klonk.Database;\nimport klonk.Row;\n' : ''}
public class ${programName(track, lang)} {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
    }
}
`
    case 'csharp':
      return 'using klonk;\n\nvar klonk = new Klonk();\n'
    default:
      return ''
  }
}

/** Datei einer Aufgabendatenbank (im IDE-Explorer als Projektdatenbank sichtbar) */
export const databaseFile = (name: string) => `${name}.sqlite.sql`

/**
 * Ordner einer Aufgabe mit Aufgabentext, Startwelt(en), Datenbanken (Daten der ersten Startsituation) und dem Programm in
 * der ersten erlaubten Sprache. Liefert den Programmpfad ohne Endung für das Manifest.
 */
export function taskFolderFiles(task: LearnTask, index: number, lang: 'de' | 'en', language: LearnLanguage, track: LearnTrack = 'basics') {
  const l = LABELS[lang]
  const folder = `${index + 1} ${safeName(task.title[lang])}`
  const text = [`# ${task.title[lang]}`, '', task.text[lang], '', ...(task.hints ?? []).map((h, i) => `> ${l.hint} ${i + 1}: ${h[lang]}`), '', l.check, ''].join('\n')
  const worlds = task.worlds.map((world, i) => ({
    path: `${folder}/${task.worlds.length > 1 ? `${l.world} ${i + 1}` : l.world}.klonkworld.json`,
    content: `${JSON.stringify(world, null, 2)}\n`,
  }))
  const databases = (task.databases ?? []).map(db => ({
    path: `${folder}/${databaseFile(localize(db.name, lang))}`,
    content: `${databaseSql(db, 0, lang).trim()}\n`,
  }))
  const program = `${folder}/${programName(track, lang)}`
  return {
    folder,
    program,
    files: [
      { path: `${folder}/${l.text}.md`, content: text },
      ...worlds,
      ...databases,
      { path: `${program}.${LEARN_EXTENSIONS[language]}`, content: starterSource(language, track, lang) },
    ],
  }
}

/** Startinhalt eines Modulprojekts: Manifest und je Aufgabe ein Ordner (Cloud: der Server, lokal: der Browser) */
export function moduleProjectFiles(module: LearnModule, lang: 'de' | 'en', language: LearnLanguage) {
  const manifest = emptyManifest(module.id)
  const folders: string[] = []
  const files: { path: string, content: string }[] = []
  module.tasks.forEach((task, i) => {
    const entry = taskFolderFiles(task, i, lang, language, module.track)
    manifest.tasks[task.id] = entry.program
    folders.push(entry.folder)
    files.push(...entry.files)
  })
  return { folders, files: [{ path: LEARN_MANIFEST, content: serializeManifest(manifest, module.track) }, ...files] }
}

/** Stand einer Aufgabe in der Übersicht für Lehrkräfte */
export type LearnTaskState = 'solved' | 'started' | 'open'

/** Lernstand eines Kontos in einem Modul (aus dem Cloud-Projekt) */
export type LearnModuleProgress = {
  projectId: string
  updatedAt: string
  solved: string[]
  /** Aufgaben mit eigenem Programm (auch ungelöst) */
  started: string[]
}

/** GET /api/learn – was das Konto starten darf, eigene Modulprojekte, geleitete Gruppen */
export type LearnStatus = {
  /** Klonk Cloud verfügbar (gehostet nur mit Abo) – ohne bleiben Browser und Ordner, falls erlaubt */
  cloud: boolean
  /** Startbare Module (Privatkonten/Lehrkräfte alle, Lernende nur freigegebene) */
  modules: string[]
  /** Erlaubte Sprachen je startbarem Modul (Vorgabe der Gruppenleitung, sonst beide) */
  languages: Record<string, LearnLanguage[]>
  /** Erlaubte Speicherorte je startbarem Modul (Organisation, ggf. eingeschränkt durch die Gruppe; Cloud nur mit Klonk Cloud) */
  storage: Record<string, LearnStorage[]>
  /** Freigabe über Gruppen (Lernende einer Organisation) – sonst alle Module */
  restricted: boolean
  projects: Record<string, LearnModuleProgress>
  /** Gruppen, deren Lernstand das Konto sehen und deren Module es freigeben darf */
  groups: { id: string, name: string, modules: string[], members: number }[]
  /** Eigene Module der Organisation: Lehrkräfte/Admins alle, Lernende die in ihren Gruppen freigegebenen */
  custom: CustomModuleSummary[]
}

/** GET /api/learn/groups/:id – Lernstand einer Gruppe */
export type LearnGroupProgress = {
  id: string
  name: string
  modules: string[]
  /** Sprachvorgabe je freigegebenem Modul */
  languages: Record<string, LearnLanguageChoice>
  /** Speicherorte der Gruppe (`null` = Vorgabe der Organisation) und die der Organisation */
  storage: LearnStorage[] | null
  organizationStorage: LearnStorage[]
  /** Jahrgangsstufe der Gruppe (`'courses'` = Zusatzkurse, `null` = nicht zugeordnet) */
  level: string | null
  members: { userId: string, displayName: string, username: string | null, modules: Record<string, LearnModuleProgress> }[]
}

/** Gruppe in der Unterrichtsübersicht (nur geleitete Gruppen) */
export type TeachingGroup = {
  id: string
  name: string
  level: string | null
  /** Lernende (ohne Gruppenleitung) */
  members: number
  modules: string[]
  languages: Record<string, LearnLanguageChoice>
}

/** GET /api/teaching – Schule (für die Lehrplan-Zuordnung) und geleitete Gruppen */
export type TeachingOverview = {
  school: { type: 'school' | 'company', country: string | null, state: string | null, schoolForm: string | null } | null
  /** Admin der Organisation (Hinweis auf die Einstellungen in der Verwaltung) */
  admin: boolean
  groups: TeachingGroup[]
}

/** GET /api/teaching/progress?level= – je Gruppe und freigegebenem Modul: gelöste Aufgaben aller Lernenden, begonnene Modulprojekte */
export type TeachingProgress = Record<string, Record<string, { solved: number, started: number }>>

const LANGS = ['de', 'en'] as const

/** Lernstand aus den Dateien eines Modulprojekts (Server und Tests) */
export function progressFromFiles(module: LearnModule, files: { path: string, content: string | null }[]): Pick<LearnModuleProgress, 'solved' | 'started'> {
  const manifest = parseManifest(files.find(f => f.path === LEARN_MANIFEST)?.content, module.id)
  const solved = module.tasks.filter(t => manifest.solved[t.id]).map(t => t.id)
  // Begonnen = eigenes Programm in einer Sprache der Reihe (nicht leer, nicht nur die Startvorlage)
  const begun = (content: string | null, language: LearnLanguage) => {
    const text = content?.trim()
    return !!text && LANGS.every(l => text !== starterSource(language, module.track, l).trim())
  }
  const started = module.tasks.filter(t => TRACK_LANGUAGES[module.track].some((language) => {
    const path = taskFile(manifest, t.id, language)
    return files.some(f => f.path === path && begun(f.content, language))
  })).map(t => t.id)
  return { solved, started }
}
