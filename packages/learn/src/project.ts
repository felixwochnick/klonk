import type { LearnModule } from './types'

/**
 * Lernmodule in der Klonk Cloud: jedes gestartete Modul ist ein eigenes Cloud-Projekt des Kontos.
 * Darin je Aufgabe `<aufgabe>.blocks` und `<aufgabe>.klonk`, im Manifest `klonk.json` der Lernstand.
 */

export const LEARN_MANIFEST = 'klonk.json'

export type LearnLanguage = 'blocks' | 'klonk'

export type LearnManifest = {
  module: string
  /** Zuletzt gewählte Sprache je Aufgabe */
  languages: Record<string, LearnLanguage>
  /** Gelöste Aufgaben mit Zeitpunkt (ISO) */
  solved: Record<string, string>
}

export const taskFile = (taskId: string, language: LearnLanguage) => `${taskId}.${language}`

export function emptyManifest(moduleId: string): LearnManifest {
  return { module: moduleId, languages: {}, solved: {} }
}

/** Manifest aus `klonk.json` lesen (fehlerhaft/fremd ⇒ leer) */
export function parseManifest(text: string | null | undefined, moduleId: string): LearnManifest {
  try {
    const learn = (JSON.parse(text ?? '') as { learn?: Partial<LearnManifest> }).learn
    if (!learn || learn.module !== moduleId) return emptyManifest(moduleId)
    const record = <T>(value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, T> : {})
    return { module: moduleId, languages: record<LearnLanguage>(learn.languages), solved: record<string>(learn.solved) }
  }
  catch {
    return emptyManifest(moduleId)
  }
}

export function serializeManifest(manifest: LearnManifest) {
  return `${JSON.stringify({ learn: manifest }, null, 2)}\n`
}

/** Name des Cloud-Projekts, z. B. „Lernmodul 1 – Erste Schritte – Anweisungen“ (ohne `:`, das in Pfaden nicht erlaubt ist) */
export function learnProjectName(module: LearnModule, index: number, lang: 'de' | 'en') {
  const label = lang === 'en' ? 'Learning module' : 'Lernmodul'
  return `${label} ${index + 1} – ${module.title[lang].replace(/:\s*/g, ' – ')}`
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
  members: { userId: string, displayName: string, username: string | null, modules: Record<string, LearnModuleProgress> }[]
}

/** Lernstand aus den Dateien eines Modulprojekts (Server und Tests) */
export function progressFromFiles(module: LearnModule, files: { path: string, content: string | null }[]): Pick<LearnModuleProgress, 'solved' | 'started'> {
  const manifest = parseManifest(files.find(f => f.path === LEARN_MANIFEST)?.content, module.id)
  const solved = module.tasks.filter(t => manifest.solved[t.id]).map(t => t.id)
  const started = module.tasks.filter(t => files.some(f => (f.path === taskFile(t.id, 'blocks') || f.path === taskFile(t.id, 'klonk')) && !!f.content?.trim())).map(t => t.id)
  return { solved, started }
}
