import { describe, expect, it } from 'vitest'
import { codeSolution, compareOutcome, customModule, customModuleProblems, customModuleSchema, customSummary, expectedOutcomes, learnProjectName, map, moduleProjectFiles, newCustomModule, newCustomTask, parseCustomModule, progressFromFiles, referenceSolution, runTrusted, serializeManifest, summaryInfo, type CustomModuleData } from '../src'

/** Fertiges Modul der Reihe E: zur Marke laufen und markieren */
function basicsModule(): CustomModuleData {
  const data = newCustomModule('basics', 'de', 'Unser Schulhof')
  data.code = 'H1'
  data.tasks[0] = {
    ...data.tasks[0]!,
    title: 'Zur Bank',
    text: 'Laufe zur gelben Marke und färbe sie rot.',
    worlds: [map('> . . y'), map('> . . . y')],
    solution: 'wiederhole solange nicht istMarke\n  schritt\nende\nmarkieren(rot)',
    check: { position: true, cells: true },
    requires: ['repeatWhile', 'groupBy'],
  }
  return data
}

describe('Eigene Lernmodule', () => {
  it('legt neue Module je Reihe gültig an', () => {
    for (const track of ['basics', 'advanced', 'sql', 'apps'] as const) {
      const data = newCustomModule(track, 'en', 'Test')
      expect(customModuleSchema.parse(data)).toEqual(data)
      expect(data.tasks[0]!.worlds.length > 0).toBe(track === 'basics' || track === 'advanced')
      expect(data.tasks[0]!.databases.length > 0).toBe(track === 'sql' || track === 'apps')
    }
  })

  it('lehnt doppelte Aufgaben-IDs, ungültige Welten und Datenbanknamen ab', () => {
    const data = basicsModule()
    expect(parseCustomModule({ ...data, tasks: [data.tasks[0], data.tasks[0]] })).toBeNull()
    expect(parseCustomModule({ ...data, tasks: [{ ...data.tasks[0], worlds: [{ version: 1 }] }] })).toBeNull()
    expect(parseCustomModule({ ...data, tasks: [{ ...data.tasks[0], databases: [{ name: '../x', sql: ['SELECT 1'] }] }] })).toBeNull()
    expect(parseCustomModule(data)).toEqual(data)
  })

  it('wandelt ins Format der eingebauten Module (Lösung übersetzt, nur passende Prüfungen und Bausteine)', async () => {
    const module = customModule('custom-1', basicsModule(), '2026-01-01')
    const task = module.tasks[0]!
    expect(module).toMatchObject({ id: 'custom-1', track: 'basics', code: 'H1', revision: '2026-01-01', title: { de: 'Unser Schulhof', en: 'Unser Schulhof' } })
    expect(task.solution!.en).toBe('repeat while not isMark\n  step\nend\nsetMark(red)')
    expect(task.requires).toEqual(['repeatWhile'])
    expect(task.check).toEqual({ position: true, cells: true })

    const expected = await expectedOutcomes(task)
    expect(expected).toHaveLength(2)
    expect(compareOutcome(task.check, expected[1]!, await runTrusted('schritt(4)\nmarkieren(rot)', task.worlds[1]!))).toBeNull()
    expect(compareOutcome(task.check, expected[1]!, await runTrusted('schritt(3)\nmarkieren(rot)', task.worlds[1]!))).toMatchObject({ code: 'position' })
  })

  it('meldet fehlende Angaben', () => {
    const data = newCustomModule('basics', 'de', '')
    data.tasks[0]!.worlds = [{ ...data.tasks[0]!.worlds[0]!, characters: [] }]
    data.tasks[0]!.check = {}
    expect(customModuleProblems(data).map(p => p.code)).toEqual(['title', 'task_title', 'task_text', 'task_character', 'task_solution', 'task_check'])
    expect(customModuleProblems(basicsModule())).toEqual([])
    expect(customModuleProblems({ ...basicsModule(), tasks: [] })).toEqual([{ code: 'tasks' }])

    const sql = newCustomModule('sql', 'de', 'Abfragen')
    sql.tasks[0] = { ...sql.tasks[0]!, title: 'Alle', text: 'Alle Schüler', databases: [], solution: 'SELECT 1' }
    expect(customModuleProblems(sql)).toEqual([{ code: 'task_database', task: 0 }])
  })

  it('nutzt bei Programmiersprachen die vorhandenen Lösungen', () => {
    const data = newCustomModule('advanced', 'en', 'Loops')
    data.tasks[0] = { ...data.tasks[0]!, title: 'Walk', text: 'Walk', solutions: { python: 'from klonk import Klonk\nKlonk().step(5)\n', java: '' } }
    const task = customModule('custom-2', data).tasks[0]!
    expect(task.solutions).toEqual({ python: data.tasks[0].solutions.python })
    expect(referenceSolution(task.solutions)).toEqual({ language: 'python', source: data.tasks[0].solutions.python })
    expect(codeSolution(task.solutions!, 'java')).toBe(data.tasks[0].solutions.python)
    expect(codeSolution({ javascript: 'a', java: 'public class Program {}' }, 'java', 'de')).toBe('public class Programm {}')
    expect(codeSolution({ javascript: 'class Program', java: '' }, 'java', 'de')).toBe('class Program')
    expect(customModuleProblems(data)).toEqual([])
  })

  it('legt Modulprojekte an und liest den Lernstand wie bei eingebauten Modulen', () => {
    const data = basicsModule()
    data.tasks.push({ ...newCustomTask('basics', 'de', data.tasks), title: 'Zurück', text: '…', solution: 'drehen' })
    const module = customModule('custom-3', data)
    expect(learnProjectName(module, 'de')).toBe('Lernmodul H1 – Unser Schulhof')
    expect(learnProjectName({ ...module, code: '' }, 'en')).toBe('Learning module – Unser Schulhof')

    const { files } = moduleProjectFiles(module, 'de', 'klonk')
    expect(JSON.parse(files[0]!.content)).toMatchObject({ language: 'klonk', learn: { module: 'custom-3', tasks: { [data.tasks[0]!.id]: '1 Zur Bank/Programm' } } })
    // Ohne Reihe kennt das Paket eigene Module nicht – SQL-Module sind keine Klonk-Script-Projekte
    expect(JSON.parse(serializeManifest({ module: 'custom-3', tasks: {}, languages: {}, solved: {} }, 'sql'))).not.toHaveProperty('language')

    const manifest = JSON.parse(files[0]!.content)
    manifest.learn.solved[data.tasks[1]!.id] = '2026-01-01'
    const progress = progressFromFiles(module, [
      { path: 'klonk.json', content: JSON.stringify(manifest) },
      { path: '1 Zur Bank/Programm.klonk', content: 'schritt' },
    ])
    expect(progress).toEqual({ solved: [data.tasks[1]!.id], started: [data.tasks[0]!.id] })
  })

  it('fasst Module für Übersichten zusammen', () => {
    const summary = customSummary('custom-4', basicsModule(), { author: 'Frau Lehmann', mine: true, editable: true, updatedAt: '2026-01-01T00:00:00.000Z' })
    expect(summary).toMatchObject({ ready: true, code: 'H1', tasks: [{ title: 'Zur Bank' }] })
    expect(summaryInfo(summary)).toMatchObject({ id: 'custom-4', title: { de: 'Unser Schulhof', en: 'Unser Schulhof' }, tasks: [{ title: { en: 'Zur Bank' } }] })
  })
})
