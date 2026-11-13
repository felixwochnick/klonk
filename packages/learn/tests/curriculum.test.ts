import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CURRICULUM, CURRICULUM_BASIC_MODULES, CURRICULUM_MODULE_ORDER, curriculumFor, formatModuleNumbers, hasCurriculum, LEARN_MODULES, recommendedModules } from '../src'

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
  it('kennt nur vorhandene Module in Kursreihenfolge', () => {
    expect(CURRICULUM_MODULE_ORDER).toEqual(LEARN_MODULES.map(m => m.id))
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
    // Realschule: Stufe 8 gehört zu 5–8 und 8–10
    expect(curriculumFor('BY', 'realschule', 8)).toHaveLength(2)
    expect(recommendedModules('BY', 'realschule', '8')).toEqual(CURRICULUM_BASIC_MODULES)
    // Grundschule und Förderschule beginnen mit dem Einstieg
    expect(recommendedModules('BY', 'grundschule', '3')).toEqual(['paths', 'building', 'patterns'])
    expect(recommendedModules('BY', 'foerderschule', '5').slice(0, 3)).toEqual(['paths', 'building', 'patterns'])
  })

  it('fasst Modulnummern zusammen', () => {
    expect(formatModuleNumbers(['sequence', 'repeat', 'while', 'conditions', 'variables'])).toBe('1–4, 6')
    expect(formatModuleNumbers(['repeat', 'while'])).toBe('2, 3')
    expect(formatModuleNumbers([])).toBe('')
    expect(formatModuleNumbers(['paths', 'building', 'patterns', 'sequence', 'repeat', 'functions'])).toBe('E1–E3, 1, 2, 7')
    expect(formatModuleNumbers(['paths', 'patterns'])).toBe('E1, E3')
  })
})
