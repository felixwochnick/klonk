import { moduleCode, moduleOrder, LEARN_MODULES } from './registry'
import { LEARN_TRACKS, TRACK_CODES, type Text } from './types'

/**
 * Lehrplan-Zuordnung: welche Lernmodule zu welcher Jahrgangsstufe passen – je Bundesland (ISO 3166-2 ohne `DE-`) und
 * Schulform (Schlüssel aus `SCHOOL_FORMS` in `@klonk/core`). Quelle ist die Tabelle in der Doku
 * (`4.teaching/2.modules/1.overview.md`, ein Test vergleicht beide), die Begründung steht auf der jeweiligen Klassenseite
 * („Passende Lernmodule“). Einträge ohne Module verweisen nur auf die Klassenseite (Lehrplan ohne passende Module, z. B.
 * formale Sprachen). Eine Jahrgangsstufe kann mehrere Einträge haben, z. B. für eine Teilgruppe mit eigener `note`.
 */
export type CurriculumEntry = {
  state: string
  forms: readonly string[]
  /** Jahrgangsstufen von–bis (beide eingeschlossen) */
  grades: readonly [from: number, to: number]
  /** Empfohlene Module in Kursreihenfolge */
  modules: string[]
  /** Einordnung, z. B. „Einführungsphase“ */
  note?: Text
  /** Klassenseite der Doku ohne Sprachpräfix */
  docs: string
}

/**
 * Module über ihre Kürzel: `mods('E4-7', 'E9', 'S1-3')` ⇒ IDs in Kursreihenfolge. Unbekannte Kürzel werfen (ein Test lädt
 * die Tabelle), damit die Zuordnung nicht stillschweigend Module verliert.
 */
function mods(...codes: string[]) {
  const ids: string[] = []
  for (const code of codes) {
    const match = /^([A-Z])(\d+)(?:-(\d+))?$/.exec(code)
    if (!match) throw new Error(`Ungültiges Modulkürzel ${code}`)
    const [, letter, from, to] = match
    for (let n = Number(from); n <= Number(to ?? from); n++) {
      const module = LEARN_MODULES.find(m => moduleCode(m.id) === `${letter}${n}`)
      if (!module) throw new Error(`Unbekanntes Modul ${letter}${n}`)
      ids.push(module.id)
    }
  }
  return ids
}

const GYMNASIUM = ['gymnasium7', 'gymnasium8', 'gymnasium9']
const BEGINNERS: Text = { de: 'für Lernende ohne Vorkenntnisse', en: 'for learners without prior knowledge' }
const INTRO_PHASE: Text = { de: 'Einführungsphase', en: 'introductory phase' }

const BW = 'teaching/germany/baden-wuerttemberg/gymnasium'
const BY = 'teaching/germany/bavaria'
const HE = 'teaching/germany/hesse/gymnasium'
const NI = 'teaching/germany/lower-saxony/gymnasium'
const NW = 'teaching/germany/north-rhine-westphalia/gymnasium'
const SN = 'teaching/germany/saxony/gymnasium'

/** Mittelschule Bayern je Jahrgangsstufe – die weiteren Förderschwerpunkte der Förderschule übernehmen sie unverändert */
const MITTELSCHULE: { grade: number, modules: string[], note?: Text }[] = [
  { grade: 5, modules: mods('E4-5') },
  { grade: 6, modules: mods('E5-7') },
  { grade: 7, modules: mods('E6-9', 'E11') },
  { grade: 8, modules: mods('E9-10', 'E12') },
  { grade: 9, modules: mods('E8', 'E10', 'E13') },
  { grade: 9, modules: mods('F1-3'), note: { de: 'Mittlere-Reife-Klasse', en: 'Mittlere-Reife class' } },
]
const OTHER_FOCUS: Text = { de: 'weitere Förderschwerpunkte (wie Mittelschule)', en: 'other special needs (as Mittelschule)' }

export const CURRICULUM: CurriculumEntry[] = [
  { state: 'BW', forms: GYMNASIUM, grades: [5, 6], modules: mods('E4-5'), docs: `${BW}/grade-5-6` },
  { state: 'BW', forms: GYMNASIUM, grades: [7, 7], modules: mods('E5-10'), docs: `${BW}/grade-7` },
  { state: 'BW', forms: GYMNASIUM, grades: [8, 8], modules: mods('E8', 'E10', 'E12-13'), note: { de: 'Profilfach IMP', en: 'IMP profile subject' }, docs: `${BW}/grade-8` },
  { state: 'BW', forms: GYMNASIUM, grades: [9, 9], modules: mods('F1-5'), docs: `${BW}/grade-9` },
  { state: 'BW', forms: GYMNASIUM, grades: [10, 10], modules: mods('F5'), docs: `${BW}/grade-10` },
  { state: 'BW', forms: GYMNASIUM, grades: [10, 10], modules: mods('F1-4'), note: { de: 'Brückenkurs, zweistündig in Klasse 10', en: 'bridging course, two lessons a week in grade 10' }, docs: `${BW}/grade-10` },
  { state: 'BW', forms: GYMNASIUM, grades: [11, 13], modules: mods('F4', 'F6-8', 'S1-6', 'A1-3'), docs: `${BW}/upper-secondary` },

  { state: 'BY', forms: GYMNASIUM, grades: [6, 6], modules: [], docs: `${BY}/gymnasium/grade-6` },
  { state: 'BY', forms: GYMNASIUM, grades: [7, 7], modules: mods('E4-7'), docs: `${BY}/gymnasium/grade-7` },
  { state: 'BY', forms: GYMNASIUM, grades: [9, 9], modules: mods('F1-4', 'F6-7', 'S1-4'), docs: `${BY}/gymnasium/grade-9` },
  { state: 'BY', forms: GYMNASIUM, grades: [10, 10], modules: mods('F5', 'F7', 'S5-6', 'A1'), docs: `${BY}/gymnasium/grade-10` },
  { state: 'BY', forms: GYMNASIUM, grades: [11, 11], modules: mods('E4-7', 'F1-5'), note: { de: 'spät beginnende Informatik', en: 'late-start computer science' }, docs: `${BY}/gymnasium/grade-11` },
  { state: 'BY', forms: GYMNASIUM, grades: [12, 12], modules: mods('F8'), docs: `${BY}/gymnasium/grade-12` },
  { state: 'BY', forms: GYMNASIUM, grades: [12, 12], modules: mods('F6-7'), note: { de: 'gA nach spät beginnender Informatik', en: 'basic level after late-start computer science' }, docs: `${BY}/gymnasium/grade-12` },
  { state: 'BY', forms: GYMNASIUM, grades: [13, 13], modules: [], docs: `${BY}/gymnasium/grade-13` },
  { state: 'BY', forms: ['realschule'], grades: [5, 8], modules: mods('E4-7', 'E9'), docs: `${BY}/realschule/grade-5-8` },
  { state: 'BY', forms: ['realschule'], grades: [8, 10], modules: mods('F1-6', 'S1-6'), note: { de: 'Aufbauunterricht', en: 'advanced course' }, docs: `${BY}/realschule/grade-8-10` },
  ...MITTELSCHULE.map(({ grade, modules, note }): CurriculumEntry => ({
    state: 'BY', forms: ['mittelschule'], grades: [grade, grade], modules, note, docs: `${BY}/mittelschule/grade-${grade}`,
  })),
  // Förderschule: Förderschwerpunkt Lernen eigener Lehrplan, übrige Förderschwerpunkte wie Mittelschule
  { state: 'BY', forms: ['foerderschule'], grades: [5, 9], modules: mods('E1-7', 'E9', 'E10'), note: { de: 'Förderschwerpunkt Lernen', en: 'special needs: learning' }, docs: `${BY}/foerderschule/lernen` },
  ...MITTELSCHULE.map(({ grade, modules, note }): CurriculumEntry => ({
    state: 'BY', forms: ['foerderschule'], grades: [grade, grade], modules,
    note: note ? { de: `${OTHER_FOCUS.de}, ${note.de}`, en: `${OTHER_FOCUS.en}, ${note.en}` } : OTHER_FOCUS,
    docs: `${BY}/foerderschule/other-focus-areas`,
  })),
  // Grundschule: Einstieg mit Welten zum Anfassen (aus 3×3-Platten, druckbar)
  { state: 'BY', forms: ['grundschule'], grades: [1, 2], modules: mods('E1', 'E3'), docs: `${BY}/grundschule/grade-1-2` },
  { state: 'BY', forms: ['grundschule'], grades: [3, 4], modules: mods('E1-3'), docs: `${BY}/grundschule/grade-3-4` },
  { state: 'BY', forms: ['fos', 'bos'], grades: [11, 11], modules: mods('E4-7'), note: BEGINNERS, docs: `${BY}/fos-bos/grade-11` },
  { state: 'BY', forms: ['fos', 'bos'], grades: [12, 12], modules: mods('E4-7'), note: BEGINNERS, docs: `${BY}/fos-bos/grade-12` },
  { state: 'BY', forms: ['fos', 'bos'], grades: [12, 12], modules: mods('F1-4', 'F6-7', 'S1-6', 'A1-2'), docs: `${BY}/fos-bos/grade-12` },
  { state: 'BY', forms: ['fos', 'bos'], grades: [13, 13], modules: mods('F4', 'F6-7', 'S5-7'), docs: `${BY}/fos-bos/grade-13` },
  { state: 'BY', forms: ['fos', 'bos'], grades: [13, 13], modules: mods('E4-7', 'F1-3'), note: { de: 'Einstieg in Jahrgangsstufe 13', en: 'starting in grade 13' }, docs: `${BY}/fos-bos/grade-13` },

  { state: 'HE', forms: GYMNASIUM, grades: [5, 6], modules: mods('E4-7'), docs: `${HE}/grade-5-6` },
  { state: 'HE', forms: GYMNASIUM, grades: [7, 10], modules: mods('E5-7', 'E9', 'F1-2', 'S1-3'), docs: `${HE}/grade-7-10` },
  { state: 'HE', forms: GYMNASIUM, grades: [11, 11], modules: mods('F1-5'), note: INTRO_PHASE, docs: `${HE}/grade-11` },
  { state: 'HE', forms: GYMNASIUM, grades: [12, 13], modules: mods('F4', 'F6-8', 'S1-7', 'A1-2'), docs: `${HE}/grade-12-13` },

  { state: 'NI', forms: GYMNASIUM, grades: [9, 9], modules: mods('E4-7'), docs: `${NI}/grade-9` },
  { state: 'NI', forms: GYMNASIUM, grades: [10, 10], modules: mods('E6-10'), docs: `${NI}/grade-10` },
  { state: 'NI', forms: GYMNASIUM, grades: [11, 11], modules: mods('F1-3'), note: INTRO_PHASE, docs: `${NI}/grade-11` },
  { state: 'NI', forms: GYMNASIUM, grades: [12, 13], modules: mods('F4-8', 'S1-6', 'A1'), docs: `${NI}/upper-secondary` },

  { state: 'NW', forms: GYMNASIUM, grades: [5, 6], modules: mods('E4-8'), docs: `${NW}/grade-5-6` },
  { state: 'NW', forms: GYMNASIUM, grades: [9, 10], modules: mods('E8-10', 'F1-3'), docs: `${NW}/grade-9-10` },
  { state: 'NW', forms: GYMNASIUM, grades: [11, 11], modules: mods('F1-7'), note: INTRO_PHASE, docs: `${NW}/grade-11` },
  { state: 'NW', forms: GYMNASIUM, grades: [12, 13], modules: mods('F7-8', 'S1-7', 'A1-4'), docs: `${NW}/grade-12-13` },

  { state: 'SN', forms: GYMNASIUM, grades: [7, 7], modules: mods('E4-7'), docs: `${SN}/grade-7` },
  { state: 'SN', forms: GYMNASIUM, grades: [8, 8], modules: mods('E4-7'), docs: `${SN}/grade-8` },
  { state: 'SN', forms: GYMNASIUM, grades: [9, 9], modules: mods('S1-5'), docs: `${SN}/grade-9` },
  { state: 'SN', forms: GYMNASIUM, grades: [10, 10], modules: mods('F1-3'), docs: `${SN}/grade-10` },
  { state: 'SN', forms: GYMNASIUM, grades: [11, 12], modules: mods('F4-8'), docs: `${SN}/upper-secondary` },
]

/** Gibt es für Bundesland und Schulform eine Lehrplan-Zuordnung? */
export function hasCurriculum(state: string | null | undefined, form: string | null | undefined) {
  return CURRICULUM.some(e => e.state === state && e.forms.includes(form ?? ''))
}

/** Lehrplan-Einträge einer Jahrgangsstufe (mehrere, wenn sich Bereiche überschneiden, z. B. Realschule 5–8 und 8–10) */
export function curriculumFor(state: string | null | undefined, form: string | null | undefined, level: string | number | null | undefined): CurriculumEntry[] {
  const grade = Number(level)
  if (!Number.isInteger(grade)) return []
  return CURRICULUM.filter(e => e.state === state && e.forms.includes(form ?? '') && grade >= e.grades[0] && grade <= e.grades[1])
}

/** Empfohlene Module einer Jahrgangsstufe (alle Einträge zusammen, Kursreihenfolge) */
export function recommendedModules(state: string | null | undefined, form: string | null | undefined, level: string | number | null | undefined) {
  const ids = new Set(curriculumFor(state, form, level).flatMap(e => e.modules))
  return moduleOrder().filter(id => ids.has(id))
}

/** Modulkürzel kompakt je Reihe: E4, E5, E6, E7, E9, S1 ⇒ „E4–E7, E9, S1“ */
export function formatModuleCodes(ids: string[]) {
  const parts: string[] = []
  for (const track of LEARN_TRACKS) {
    const letter = TRACK_CODES[track]
    const numbers = ids.map(moduleCode).filter(code => code.startsWith(letter)).map(code => Number(code.slice(1))).sort((a, b) => a - b)
    for (let i = 0; i < numbers.length; i++) {
      let j = i
      while (j + 1 < numbers.length && numbers[j + 1] === numbers[j]! + 1) j++
      parts.push(j - i >= 2 ? `${letter}${numbers[i]}–${letter}${numbers[j]}` : numbers.slice(i, j + 1).map(n => `${letter}${n}`).join(', '))
      i = j
    }
  }
  return parts.join(', ')
}
