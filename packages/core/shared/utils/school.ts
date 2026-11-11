/**
 * Schulstruktur: Land → Bundesland → Schulform → Jahrgangsstufen. Gruppen (Klassen) werden einer Jahrgangsstufe
 * oder den Zusatzkursen zugeordnet (`groups.level`). Namen der Länder/Schulformen kommen aus der i18n der Verwaltung.
 */

export const SCHOOL_COUNTRIES = ['DE'] as const
export type SchoolCountry = typeof SCHOOL_COUNTRIES[number]

/** Gruppen ohne Jahrgangsstufe: AGs, Wahlkurse, Förderkurse … */
export const COURSES_LEVEL = 'courses'

type Grades = readonly [from: number, to: number]

export const SCHOOL_FORMS = {
  grundschule: [1, 4],
  grundschule6: [1, 6],
  hauptschule: [5, 10],
  mittelschule: [5, 10],
  werkrealschule: [5, 10],
  realschule: [5, 10],
  realschulePlus: [5, 10],
  regionaleSchule: [5, 10],
  regelschule: [5, 10],
  oberschule: [5, 10],
  oberschule7: [7, 10],
  sekundarschule: [5, 10],
  integrierteSekundarschule: [7, 13],
  stadtteilschule: [5, 13],
  gemeinschaftsschule: [5, 13],
  gesamtschule: [5, 13],
  gymnasium8: [5, 12],
  gymnasium9: [5, 13],
  gymnasium7: [7, 12],
  beruflichesGymnasium: [11, 13],
  fos: [11, 13],
  bos: [12, 13],
  berufsschule: [10, 12],
  berufskolleg: [11, 13],
  foerderschule: [1, 10],
  other: [1, 13],
} as const satisfies Record<string, Grades>
export type SchoolForm = keyof typeof SCHOOL_FORMS

const COMMON: SchoolForm[] = ['foerderschule', 'berufsschule', 'other']

/** Schulformen je Bundesland (ISO 3166-2 ohne `DE-`) – Gymnasien mit der Dauer, die dort üblich ist */
export const GERMAN_STATES: Record<string, SchoolForm[]> = {
  BW: ['grundschule', 'werkrealschule', 'realschule', 'gemeinschaftsschule', 'gymnasium9', 'gymnasium8', 'beruflichesGymnasium'],
  BY: ['grundschule', 'mittelschule', 'realschule', 'gymnasium9', 'fos', 'bos'],
  BE: ['grundschule6', 'integrierteSekundarschule', 'gemeinschaftsschule', 'gymnasium7', 'gymnasium8', 'beruflichesGymnasium'],
  BB: ['grundschule6', 'oberschule7', 'gesamtschule', 'gymnasium7', 'beruflichesGymnasium'],
  HB: ['grundschule', 'oberschule', 'gymnasium8'],
  HH: ['grundschule', 'stadtteilschule', 'gymnasium8'],
  HE: ['grundschule', 'hauptschule', 'realschule', 'gesamtschule', 'gymnasium9', 'gymnasium8', 'beruflichesGymnasium', 'fos'],
  MV: ['grundschule', 'regionaleSchule', 'gesamtschule', 'gymnasium8'],
  NI: ['grundschule', 'hauptschule', 'realschule', 'oberschule', 'gesamtschule', 'gymnasium9', 'beruflichesGymnasium', 'fos'],
  NW: ['grundschule', 'hauptschule', 'realschule', 'sekundarschule', 'gesamtschule', 'gymnasium9', 'berufskolleg'],
  RP: ['grundschule', 'realschulePlus', 'gesamtschule', 'gymnasium9', 'gymnasium8', 'beruflichesGymnasium', 'fos'],
  SL: ['grundschule', 'gemeinschaftsschule', 'gymnasium9'],
  SN: ['grundschule', 'oberschule', 'gymnasium8', 'beruflichesGymnasium', 'fos'],
  ST: ['grundschule', 'sekundarschule', 'gemeinschaftsschule', 'gesamtschule', 'gymnasium8', 'fos'],
  SH: ['grundschule', 'gemeinschaftsschule', 'gymnasium9', 'beruflichesGymnasium'],
  TH: ['grundschule', 'regelschule', 'gemeinschaftsschule', 'gesamtschule', 'gymnasium8', 'beruflichesGymnasium'],
}

export function schoolStates(country: string | null | undefined): string[] {
  return country === 'DE' ? Object.keys(GERMAN_STATES) : []
}

/** Schulformen eines Bundeslands (ohne Bundesland: alle) */
export function schoolForms(country: string | null | undefined, state: string | null | undefined): SchoolForm[] {
  if (country !== 'DE') return []
  const forms = state && GERMAN_STATES[state] ? GERMAN_STATES[state] : (Object.keys(SCHOOL_FORMS) as SchoolForm[]).filter(f => !COMMON.includes(f))
  return [...forms, ...COMMON]
}

export const isSchoolForm = (value: string | null | undefined): value is SchoolForm => !!value && value in SCHOOL_FORMS

/** Jahrgangsstufen der Schulform als Text (`'5'` … `'13'`) */
export function schoolLevels(form: string | null | undefined): string[] {
  if (!isSchoolForm(form)) return []
  const [from, to] = SCHOOL_FORMS[form]
  return Array.from({ length: to - from + 1 }, (_, i) => String(from + i))
}

/** Jahrgangsstufe aus dem Klassennamen raten: „5a“, „05 b“, „Klasse 7c“, „10.2“ ⇒ Stufe; sonst `null` */
export function levelFromGroupName(name: string, levels: string[]): string | null {
  const match = /^(?:klasse|class|jgst\.?|jahrgang|grade)?\s*0*(\d{1,2})(?![\d])/i.exec(name.trim())
  return match && levels.includes(match[1]!) ? match[1]! : null
}
