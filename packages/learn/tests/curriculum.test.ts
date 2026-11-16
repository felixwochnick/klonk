import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CURRICULUM, curriculumFor, formatModuleCodes, hasCurriculum, LEARN_MODULES, moduleCode, moduleOrder, recommendedModules } from '../src'

const DOCS = join(import.meta.dirname, '../../../apps/docs/content')

/** Doku-Pfad (`teaching/germany/bavaria/…`) im Dateisystem finden – Ordner und Dateien tragen Nummern (`4.teaching`) */
function docsFile(lang: string, path: string) {
  let dir = join(DOCS, lang)
  const parts = path.split('/')
  for (const [i, part] of parts.entries()) {
    const last = i === parts.length - 1
    const match = readdirSync(dir).find(name => name.replace(/^\d+\./, '').replace(/\.md$/, '') === part && (last ? name.endsWith('.md') : !name.endsWith('.md')))
    if (!match) return null
    dir = join(dir, match)
  }
  return existsSync(dir) ? dir : null
}

describe('Lehrplan-Zuordnung', () => {
  it('kennt nur vorhandene Module, Kürzel je Reihe', () => {
    expect(moduleOrder()).toEqual(LEARN_MODULES.map(m => m.id))
    expect(moduleCode('sequence')).toBe('E4')
    expect(moduleCode('variables')).toBe('E9')
    for (const entry of CURRICULUM) for (const id of entry.modules) expect(moduleCode(id), id).not.toBe('')
  })

  it('verweist auf vorhandene Klassenseiten der Doku (de und en)', () => {
    for (const entry of CURRICULUM) {
      expect(docsFile('de', entry.docs), entry.docs).not.toBeNull()
      expect(docsFile('en', entry.docs), entry.docs).not.toBeNull()
    }
  })

  it('liefert die Module einer Jahrgangsstufe', () => {
    expect(hasCurriculum('BY', 'gymnasium9')).toBe(true)
    expect(hasCurriculum('BE', 'gymnasium8')).toBe(false)
    expect(recommendedModules('BY', 'gymnasium9', '7')).toEqual(['sequence', 'repeat', 'while', 'conditions'])
    expect(recommendedModules('BY', 'gymnasium9', '8')).toEqual([])
    expect(recommendedModules('BY', 'gymnasium9', 'courses')).toEqual([])
    // Reihen gemischt, in Kursreihenfolge (E vor F vor S vor A)
    expect(formatModuleCodes(recommendedModules('BY', 'gymnasium9', '10'))).toBe('F5, F7, S5, S6, A1')
    expect(recommendedModules('BY', 'gymnasium9', '10')).toEqual(['code-lists', 'code-inheritance', 'sql-join', 'sql-create', 'app-query'])
    // Realschule: Stufe 8 gehört zu 5–8 und 8–10
    expect(curriculumFor('BY', 'realschule', 8)).toHaveLength(2)
    expect(formatModuleCodes(recommendedModules('BY', 'realschule', '8'))).toBe('E4–E7, E9, F1–F6, S1–S6')
    // Förderschule (weitere Förderschwerpunkte) wie Mittelschule, zusammen mit dem Förderschwerpunkt Lernen
    expect(formatModuleCodes(recommendedModules('BY', 'mittelschule', '9'))).toBe('E8, E10, E13, F1–F3')
    expect(formatModuleCodes(recommendedModules('BY', 'foerderschule', '9'))).toBe('E1–E10, E13, F1–F3')
    // M10: Datenbanken und eine Anwendung mit Datenbank, nicht an der Förderschule
    expect(formatModuleCodes(recommendedModules('BY', 'mittelschule', '10'))).toBe('S1–S6, A1')
    expect(recommendedModules('BY', 'foerderschule', '10')).toEqual([])
    // Grundschule und Förderschule beginnen mit dem Einstieg
    expect(recommendedModules('BY', 'grundschule', '3')).toEqual(['paths', 'building', 'patterns'])
    expect(recommendedModules('BY', 'grundschule', '1')).toEqual(['paths', 'patterns'])
    expect(recommendedModules('BY', 'foerderschule', '5').slice(0, 3)).toEqual(['paths', 'building', 'patterns'])
  })

  it('stimmt mit der Tabelle der Doku überein (de und en)', () => {
    // Förderschule, weitere Förderschwerpunkte: in der Tabelle eine Zeile „wie Mittelschule“
    const asMittelschule = 'teaching/germany/bavaria/foerderschule/other-focus-areas'
    const expected = CURRICULUM.filter(e => e.modules.length && e.docs !== asMittelschule).map(e => `${e.docs}: ${formatModuleCodes(e.modules)}`)
    for (const lang of ['de', 'en']) {
      const text = readFileSync(docsFile(lang, 'teaching/modules/overview')!, 'utf8')
      const rows = [...text.matchAll(/^\|.*\]\(\/(?:de|en)\/(teaching\/germany\/[^)#]+)\) \| ([^|]+?) \|$/gm)].map(([, docs, codes]) => `${docs}: ${codes}`)
      expect(rows.filter(row => !row.startsWith(asMittelschule)), lang).toEqual(expected)
      expect(rows.some(row => row.startsWith(asMittelschule)), lang).toBe(true)
    }
  })

  it('fasst Modulkürzel zusammen', () => {
    expect(formatModuleCodes(['sequence', 'repeat', 'while', 'conditions', 'variables'])).toBe('E4–E7, E9')
    expect(formatModuleCodes(['repeat', 'while'])).toBe('E5, E6')
    expect(formatModuleCodes([])).toBe('')
  })
})
