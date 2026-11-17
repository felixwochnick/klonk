import { codeOf, codeSolution, starterSource, type CodeLanguage, type LearnModule, type LearnTask, type Outcome } from '@klonk/learn'
import type { MaterialImage, MaterialTable } from './model'
import { worldImage } from './model'

/**
 * Beschriftungen der Dokumente (Schlüssel unter `material.doc.*` in der App-i18n; `constructs.*`, `tracks.*` und
 * `languages.*` bildet die App auf ihre vorhandenen Texte ab). Das Dokument kann eine andere Sprache als die Oberfläche haben.
 */
export type MaterialLabels = (key: string, params?: Record<string, string | number>) => string

export type MaterialContext = {
  lang: 'de' | 'en'
  t: MaterialLabels
  /** Programmiersprache für Beispiele, Vorlagen und Lösungen der Reihen F und A */
  language?: CodeLanguage
  /** Schule bzw. Organisation für die Kopfzeile */
  school?: string
  /** Ergebnis der Musterlösung je Aufgabe und Startsituation (Zielbilder, erwartete Ergebnisse) */
  expected?: Record<string, Outcome[] | undefined>
  /** Tabellen der Aufgabendatenbank je Aufgabe (erste Startsituation) */
  tables?: Record<string, MaterialTable[] | undefined>
  /** Folgemodul für die Zusammenfassung der Präsentation */
  next?: { code: string, title: string }
}

/** Darstellung der Welten: 3D-Ansicht, Draufsicht (Bauplan), beides oder keine */
export type PictureStyle = 'world' | 'plan' | 'both' | 'none'

/** Höchstens so viele Zeilen je Tabelle auf Papier bzw. Folie */
export const MAX_TABLE_ROWS = 12

export const isCodeTrack = (module: LearnModule) => module.track === 'advanced' || module.track === 'apps'

/** Musterlösung als Text (Klonk-Script bzw. SQL in der Dokumentsprache, Programmiersprachen in `language`) */
export function solutionText(module: LearnModule, task: LearnTask, ctx: MaterialContext) {
  if (isCodeTrack(module)) return task.solutions ? codeSolution(task.solutions, ctx.language ?? 'python', ctx.lang).trimEnd() : ''
  return task.solution?.[ctx.lang]?.trimEnd() ?? ''
}

const count = (text: string) => text.split('\n').filter(line => line.trim()).length
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/**
 * Startvorlage der Programmiersprache um die Schreiblinien herum (Java-Klasse, Import und Figur): vorgegeben bis zur
 * Zeile mit `new Klonk()`, danach der Rest (schließende Klammern)
 */
export function starterFrame(module: LearnModule, ctx: MaterialContext) {
  if (!isCodeTrack(module)) return null
  const lines = starterSource(ctx.language ?? 'python', module.track, ctx.lang).replace(/\n+$/, '').split('\n')
  let at = lines.length - 1
  while (at >= 0 && !/Klonk\(\)/.test(lines[at]!)) at--
  if (at < 0) return null
  return {
    before: lines.slice(0, at + 1).join('\n'),
    after: lines.slice(at + 1).join('\n'),
    indent: /^\s*/.exec(lines[at]!)![0].length,
  }
}

/** Anzahl Schreiblinien: etwas mehr als die Musterlösung braucht */
export function answerLines(module: LearnModule, task: LearnTask, ctx: MaterialContext) {
  const solution = solutionText(module, task, ctx)
  if (module.track === 'sql') return clamp(count(solution) + 2, 3, 10)
  if (isCodeTrack(module)) {
    const starter = starterFrame(module, ctx)
    const given = starter ? count(starter.before) + count(starter.after) : 0
    return clamp(count(solution) - given + 3, 5, 22)
  }
  return clamp(count(solution) + 2, 4, 18)
}

/** Bilder einer Aufgabe: Startwelt(en) und – falls gewünscht – das Ergebnis der Musterlösung */
export function taskImages(task: LearnTask, ctx: MaterialContext, options: { pictures: PictureStyle, goal: boolean, allWorlds: boolean, limit?: number }): MaterialImage[] {
  if (options.pictures === 'none' || !task.worlds.length) return []
  const t = ctx.t
  const worlds = options.allWorlds ? task.worlds : task.worlds.slice(0, 1)
  const several = worlds.length > 1
  const startKinds: MaterialImage['kind'][] = options.pictures === 'both' ? ['world', 'plan'] : [options.pictures]
  // Ziel als Bauplan, wenn beides gewünscht ist (spart Platz)
  const goalKinds: MaterialImage['kind'][] = options.pictures === 'both' ? ['plan'] : [options.pictures]
  const images: MaterialImage[] = []
  worlds.forEach((world, i) => {
    for (const kind of startKinds) images.push(worldImage(kind, world, several ? t('startN', { n: i + 1 }) : t('start')))
    const goal = options.goal ? ctx.expected?.[task.id]?.[i]?.world : null
    if (goal) for (const kind of goalKinds) images.push(worldImage(kind, goal, several ? t('goalN', { n: i + 1 }) : t('goal')))
  })
  return images.slice(0, options.limit ?? 9)
}

/** Ergebnis der Musterlösung in der ersten Startsituation als Bild (Lösungsfolien) */
export function goalImage(task: LearnTask, ctx: MaterialContext, kind: MaterialImage['kind']): MaterialImage | null {
  const goal = ctx.expected?.[task.id]?.[0]?.world
  return goal ? worldImage(kind, goal, ctx.t('goal')) : null
}

/** Werte einer Tabellenzeile als Text */
export const cellText = (value: unknown) => (value === null || value === undefined ? 'NULL' : typeof value === 'object' ? JSON.stringify(value) : String(value))

export function toTable(columns: string[], rows: unknown[][], caption?: string, max = MAX_TABLE_ROWS): MaterialTable {
  return {
    columns,
    rows: rows.slice(0, max).map(row => row.map(cellText)),
    caption,
    more: rows.length > max ? rows.length - max : undefined,
  }
}

/** Kopf für Dateinamen und Fußzeilen: „E1 Wege finden“ */
export function moduleLabel(module: LearnModule, lang: 'de' | 'en') {
  const code = codeOf(module)
  return code ? `${code} ${module.title[lang]}` : module.title[lang]
}

/** Aufgaben in Modulreihenfolge (Auswahl leer bzw. fehlend = alle) */
export function selectedTasks(module: LearnModule, ids?: string[]) {
  return ids?.length ? module.tasks.filter(task => ids.includes(task.id)) : module.tasks
}
