import type { LearnModule, LearnTask } from './types'

/**
 * Lernmodule in der Klonk Cloud: jedes gestartete Modul ist ein eigenes Cloud-Projekt (Projektart Klonk-Script & Blöcke).
 * Je Aufgabe ein Ordner, z. B. `1 Zur Marke/` mit `Aufgabe.md`, Startwelt(en) `Welt.klonkworld.json` und dem Programm
 * `Programm.blocks` bzw. `Programm.klonk`. Im Manifest `klonk.json` stehen die Ordner der Aufgaben und der Lernstand.
 */

export const LEARN_MANIFEST = 'klonk.json'

export type LearnLanguage = 'blocks' | 'klonk'
export const LEARN_LANGUAGES: LearnLanguage[] = ['blocks', 'klonk']

/** Sprachvorgabe der Gruppenleitung je Modul */
export type LearnLanguageChoice = 'both' | LearnLanguage
export const LEARN_LANGUAGE_CHOICES: LearnLanguageChoice[] = ['both', 'blocks', 'klonk']
export const choiceLanguages = (choice: LearnLanguageChoice): LearnLanguage[] => (choice === 'both' ? [...LEARN_LANGUAGES] : [choice])

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

/** `klonk.json` des Modulprojekts: Projektart Klonk-Script & Blöcke plus Lernstand */
export function serializeManifest(manifest: LearnManifest) {
  return `${JSON.stringify({ language: 'klonk', learn: manifest }, null, 2)}\n`
}

/** Programmdatei einer Aufgabe (ohne Ordner-Eintrag im Manifest: alte Ablage im Projektordner) */
export const taskFile = (manifest: LearnManifest, taskId: string, language: LearnLanguage) => `${manifest.tasks[taskId] ?? taskId}.${language}`

const LABELS = {
  de: { module: 'Lernmodul', program: 'Programm', world: 'Welt', text: 'Aufgabe', hint: 'Tipp', check: 'Prüfen in Klonk unter **Lernen**.' },
  en: { module: 'Learning module', program: 'Program', world: 'World', text: 'Task', hint: 'Hint', check: 'Check it in Klonk under **Learn**.' },
}

/** Name ohne Zeichen, die in Cloud-Pfaden nicht erlaubt sind (`:` u. a.) */
const safeName = (text: string) => text.replace(/:\s*/g, ' – ').replace(/[\\/*?"<>|]/g, '').trim()

/** Name des Cloud-Projekts, z. B. „Lernmodul 1 – Erste Schritte – Anweisungen“ */
export function learnProjectName(module: LearnModule, index: number, lang: 'de' | 'en') {
  return `${LABELS[lang].module} ${index + 1} – ${safeName(module.title[lang])}`
}

/**
 * Ordner einer Aufgabe mit Aufgabentext, Startwelt(en) und (leerem) Programm in der ersten erlaubten Sprache.
 * Liefert den Programmpfad ohne Endung für das Manifest.
 */
export function taskFolderFiles(task: LearnTask, index: number, lang: 'de' | 'en', language: LearnLanguage) {
  const l = LABELS[lang]
  const folder = `${index + 1} ${safeName(task.title[lang])}`
  const text = [`# ${task.title[lang]}`, '', task.text[lang], '', ...(task.hints ?? []).map((h, i) => `> ${l.hint} ${i + 1}: ${h[lang]}`), '', l.check, ''].join('\n')
  const worlds = task.worlds.map((world, i) => ({
    path: `${folder}/${task.worlds.length > 1 ? `${l.world} ${i + 1}` : l.world}.klonkworld.json`,
    content: `${JSON.stringify(world, null, 2)}\n`,
  }))
  const program = `${folder}/${l.program}`
  return {
    folder,
    program,
    files: [{ path: `${folder}/${l.text}.md`, content: text }, ...worlds, { path: `${program}.${language}`, content: '' }],
  }
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
  /** Klonk Cloud verfügbar (gehostet nur mit Abo) – ohne gibt es keine Lernmodule */
  cloud: boolean
  /** Startbare Module (Privatkonten/Lehrkräfte alle, Lernende nur freigegebene) */
  modules: string[]
  /** Erlaubte Sprachen je startbarem Modul (Vorgabe der Gruppenleitung, sonst beide) */
  languages: Record<string, LearnLanguage[]>
  /** Freigabe über Gruppen (Lernende einer Organisation) – sonst alle Module */
  restricted: boolean
  projects: Record<string, LearnModuleProgress>
  /** Gruppen, deren Lernstand das Konto sehen und deren Module es freigeben darf */
  groups: { id: string, name: string, modules: string[], members: number }[]
}

/** GET /api/learn/groups/:id – Lernstand einer Gruppe */
export type LearnGroupProgress = {
  id: string
  name: string
  modules: string[]
  /** Sprachvorgabe je freigegebenem Modul */
  languages: Record<string, LearnLanguageChoice>
  members: { userId: string, displayName: string, username: string | null, modules: Record<string, LearnModuleProgress> }[]
}

/** Lernstand aus den Dateien eines Modulprojekts (Server und Tests) */
export function progressFromFiles(module: LearnModule, files: { path: string, content: string | null }[]): Pick<LearnModuleProgress, 'solved' | 'started'> {
  const manifest = parseManifest(files.find(f => f.path === LEARN_MANIFEST)?.content, module.id)
  const solved = module.tasks.filter(t => manifest.solved[t.id]).map(t => t.id)
  const started = module.tasks.filter(t => files.some(f => LEARN_LANGUAGES.some(l => f.path === taskFile(manifest, t.id, l)) && !!f.content?.trim())).map(t => t.id)
  return { solved, started }
}
