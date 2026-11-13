import type { Text } from './types'

/**
 * Lehrplan-Zuordnung: welche Lernmodule zu welcher Jahrgangsstufe passen – je Bundesland (ISO 3166-2 ohne `DE-`) und
 * Schulform (Schlüssel aus `SCHOOL_FORMS` in `@klonk/core`). Quelle ist die Tabelle in der Doku
 * (`4.teaching/2.modules/1.overview.md`), die Begründung steht auf der jeweiligen Klassenseite („Passende Lernmodule“).
 * Einträge ohne Module verweisen nur auf die Klassenseite (Lehrplan ohne passende Module, z. B. Objektorientierung).
 */
export type CurriculumEntry = {
  state: string
  forms: readonly string[]
  /** Jahrgangsstufen von–bis (beide eingeschlossen) */
  grades: readonly [from: number, to: number]
  /** Empfohlene Module in Kursreihenfolge */
  modules: string[]
  /** Einordnung, z. B. „Wiederholung“ */
  note?: Text
  /** Klassenseite der Doku ohne Sprachpräfix */
  docs: string
}

/** Einstieg (E1–E3) und Grundkurs (1–7) in Kursreihenfolge – zusammen wie `LEARN_MODULES` (ein Test prüft das) */
export const CURRICULUM_START_MODULES = ['paths', 'building', 'patterns']
export const CURRICULUM_BASIC_MODULES = ['sequence', 'repeat', 'while', 'conditions', 'procedures', 'variables', 'functions']
export const CURRICULUM_MODULE_ORDER = [...CURRICULUM_START_MODULES, ...CURRICULUM_BASIC_MODULES]
/** Grundkurs-Module nach Nummer (1–7) */
const m = (...numbers: number[]) => numbers.map(n => CURRICULUM_BASIC_MODULES[n - 1]!)
const span = (from: number, to: number) => m(...Array.from({ length: to - from + 1 }, (_, i) => from + i))
/** Einstiegsmodule nach Nummer (E1–E3) */
const e = (...numbers: number[]) => numbers.map(n => CURRICULUM_START_MODULES[n - 1]!)

const GYMNASIUM = ['gymnasium7', 'gymnasium8', 'gymnasium9']
const REVIEW: Text = { de: 'Wiederholung', en: 'Review' }
const BEGINNERS: Text = { de: 'für Lernende ohne Vorkenntnisse', en: 'for learners without prior knowledge' }

const BW = 'teaching/germany/baden-wuerttemberg/gymnasium'
const BY = 'teaching/germany/bavaria'
const HE = 'teaching/germany/hesse/gymnasium'
const NI = 'teaching/germany/lower-saxony/gymnasium'
const NW = 'teaching/germany/north-rhine-westphalia/gymnasium'
const SN = 'teaching/germany/saxony/gymnasium'

export const CURRICULUM: CurriculumEntry[] = [
  { state: 'BW', forms: GYMNASIUM, grades: [5, 6], modules: m(1, 2), docs: `${BW}/grade-5-6` },
  { state: 'BW', forms: GYMNASIUM, grades: [7, 7], modules: span(2, 6), docs: `${BW}/grade-7` },
  { state: 'BW', forms: GYMNASIUM, grades: [8, 8], modules: m(3, 4, 5, 7), note: { de: 'Profilfach IMP', en: 'IMP profile subject' }, docs: `${BW}/grade-8` },
  { state: 'BW', forms: GYMNASIUM, grades: [9, 9], modules: span(3, 6), note: REVIEW, docs: `${BW}/grade-9` },
  { state: 'BW', forms: GYMNASIUM, grades: [10, 10], modules: [], docs: `${BW}/grade-10` },
  { state: 'BW', forms: GYMNASIUM, grades: [11, 13], modules: [], docs: `${BW}/upper-secondary` },

  { state: 'BY', forms: GYMNASIUM, grades: [6, 6], modules: [], docs: `${BY}/gymnasium/grade-6` },
  { state: 'BY', forms: GYMNASIUM, grades: [7, 7], modules: span(1, 4), docs: `${BY}/gymnasium/grade-7` },
  { state: 'BY', forms: GYMNASIUM, grades: [9, 9], modules: m(2, 3, 4), note: REVIEW, docs: `${BY}/gymnasium/grade-9` },
  { state: 'BY', forms: GYMNASIUM, grades: [10, 10], modules: [], docs: `${BY}/gymnasium/grade-10` },
  { state: 'BY', forms: GYMNASIUM, grades: [11, 11], modules: span(1, 7), note: { de: 'spät beginnende Informatik', en: 'late-start computer science' }, docs: `${BY}/gymnasium/grade-11` },
  { state: 'BY', forms: GYMNASIUM, grades: [12, 12], modules: [], docs: `${BY}/gymnasium/grade-12` },
  { state: 'BY', forms: GYMNASIUM, grades: [13, 13], modules: [], docs: `${BY}/gymnasium/grade-13` },
  { state: 'BY', forms: ['realschule'], grades: [5, 8], modules: m(1, 2, 3, 4, 6), docs: `${BY}/realschule/grade-5-8` },
  { state: 'BY', forms: ['realschule'], grades: [8, 10], modules: span(2, 7), note: REVIEW, docs: `${BY}/realschule/grade-8-10` },
  { state: 'BY', forms: ['mittelschule'], grades: [5, 5], modules: m(1, 2), docs: `${BY}/mittelschule/grade-5` },
  { state: 'BY', forms: ['mittelschule'], grades: [6, 6], modules: m(2, 3, 4), docs: `${BY}/mittelschule/grade-6` },
  { state: 'BY', forms: ['mittelschule'], grades: [7, 7], modules: span(3, 6), docs: `${BY}/mittelschule/grade-7` },
  { state: 'BY', forms: ['mittelschule'], grades: [8, 8], modules: span(4, 7), docs: `${BY}/mittelschule/grade-8` },
  { state: 'BY', forms: ['mittelschule'], grades: [9, 9], modules: m(5, 6, 7), docs: `${BY}/mittelschule/grade-9` },
  // Förderschule: Förderschwerpunkt Lernen eigener Lehrplan, übrige Förderschwerpunkte wie Mittelschule
  { state: 'BY', forms: ['foerderschule'], grades: [5, 9], modules: [...e(1, 2, 3), ...m(1, 2, 3, 4, 6, 7)], note: { de: 'Förderschwerpunkt Lernen', en: 'special needs: learning' }, docs: `${BY}/foerderschule/lernen` },
  ...([[5, m(1, 2)], [6, m(2, 3, 4)], [7, span(3, 6)], [8, span(4, 7)], [9, m(5, 6, 7)]] as const).map(([grade, modules]): CurriculumEntry => ({
    state: 'BY', forms: ['foerderschule'], grades: [grade, grade], modules: [...modules], note: { de: 'weitere Förderschwerpunkte (wie Mittelschule)', en: 'other special needs (as Mittelschule)' }, docs: `${BY}/foerderschule/other-focus-areas`,
  })),
  { state: 'BY', forms: ['grundschule'], grades: [1, 2], modules: e(1, 3), docs: `${BY}/grundschule/grade-1-2` },
  { state: 'BY', forms: ['grundschule'], grades: [3, 4], modules: e(1, 2, 3), docs: `${BY}/grundschule/grade-3-4` },
  { state: 'BY', forms: ['fos', 'bos'], grades: [11, 11], modules: span(1, 4), note: BEGINNERS, docs: `${BY}/fos-bos/grade-11` },
  { state: 'BY', forms: ['fos', 'bos'], grades: [12, 12], modules: span(2, 7), note: BEGINNERS, docs: `${BY}/fos-bos/grade-12` },
  { state: 'BY', forms: ['fos', 'bos'], grades: [13, 13], modules: span(2, 5), note: { de: 'Einstieg in Jahrgangsstufe 13', en: 'starting in grade 13' }, docs: `${BY}/fos-bos/grade-13` },

  { state: 'HE', forms: GYMNASIUM, grades: [5, 6], modules: span(1, 4), docs: `${HE}/grade-5-6` },
  { state: 'HE', forms: GYMNASIUM, grades: [7, 10], modules: m(2, 3, 4, 6), docs: `${HE}/grade-7-10` },
  { state: 'HE', forms: GYMNASIUM, grades: [11, 11], modules: [], docs: `${HE}/grade-11` },
  { state: 'HE', forms: GYMNASIUM, grades: [12, 13], modules: [], docs: `${HE}/grade-12-13` },

  { state: 'NI', forms: GYMNASIUM, grades: [9, 9], modules: span(1, 4), docs: `${NI}/grade-9` },
  { state: 'NI', forms: GYMNASIUM, grades: [10, 10], modules: span(3, 6), docs: `${NI}/grade-10` },
  { state: 'NI', forms: GYMNASIUM, grades: [11, 11], modules: span(2, 6), note: BEGINNERS, docs: `${NI}/grade-11` },
  { state: 'NI', forms: GYMNASIUM, grades: [12, 13], modules: [], docs: `${NI}/upper-secondary` },

  { state: 'NW', forms: GYMNASIUM, grades: [5, 6], modules: span(1, 5), docs: `${NW}/grade-5-6` },
  { state: 'NW', forms: GYMNASIUM, grades: [9, 10], modules: span(3, 6), docs: `${NW}/grade-9-10` },
  { state: 'NW', forms: GYMNASIUM, grades: [11, 11], modules: span(2, 6), note: { de: 'Einführungsphase, ohne Vorkenntnisse', en: 'introductory phase, no prior knowledge' }, docs: `${NW}/grade-11` },
  { state: 'NW', forms: GYMNASIUM, grades: [12, 13], modules: [], docs: `${NW}/grade-12-13` },

  { state: 'SN', forms: GYMNASIUM, grades: [7, 7], modules: span(1, 4), docs: `${SN}/grade-7` },
  { state: 'SN', forms: GYMNASIUM, grades: [8, 8], modules: span(1, 4), docs: `${SN}/grade-8` },
  { state: 'SN', forms: GYMNASIUM, grades: [9, 9], modules: m(2, 3, 4), note: REVIEW, docs: `${SN}/grade-9` },
  { state: 'SN', forms: GYMNASIUM, grades: [10, 10], modules: span(3, 7), docs: `${SN}/grade-10` },
  { state: 'SN', forms: GYMNASIUM, grades: [11, 12], modules: [], docs: `${SN}/upper-secondary` },
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
  return CURRICULUM_MODULE_ORDER.filter(id => ids.has(id))
}

/** Modulnummern kompakt, Einstieg und Grundkurs getrennt gezählt: [E1, E2, E3, 1, 2, 3, 4, 6] ⇒ „E1–E3, 1–4, 6“ */
export function formatModuleNumbers(ids: string[]) {
  const runs = (order: string[], prefix: string) => {
    const numbers = ids.map(id => order.indexOf(id) + 1).filter(n => n > 0).sort((a, b) => a - b)
    const parts: string[] = []
    for (let i = 0; i < numbers.length; i++) {
      let j = i
      while (j + 1 < numbers.length && numbers[j + 1] === numbers[j]! + 1) j++
      parts.push(j - i >= 2 ? `${prefix}${numbers[i]}–${prefix}${numbers[j]}` : numbers.slice(i, j + 1).map(n => prefix + n).join(', '))
      i = j
    }
    return parts
  }
  return [...runs(CURRICULUM_START_MODULES, 'E'), ...runs(CURRICULUM_BASIC_MODULES, '')].join(', ')
}
