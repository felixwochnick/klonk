import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CODE_LANGUAGES, codeSolution, compareOutcome, missingCodeConstructs, missingSqlConstructs, scenarioCount, starterSource, trackModules, type Outcome } from '@klonk/learn'
import { dotnetDir, outlineOf, runCode, runSql } from './learn-harness'

// Lernmodule der Reihen F, A (Programmiersprachen) und S (SQL): jede Musterlösung löst jede Startsituation – in allen
// Sprachen gleich wie die JavaScript-Lösung (sie liefert in der App den Zielzustand). C# nur mit gebautem Host.
const csharp = existsSync(new URL('dotnet.js', dotnetDir))
const languages = CODE_LANGUAGES.filter(l => l !== 'csharp' || csharp)

describe('Lernmodule F und A', { timeout: 900_000 }, () => {
  for (const module of [...trackModules('advanced'), ...trackModules('apps')]) {
    for (const task of module.tasks) {
      it(`${module.id}/${task.id}`, async () => {
        // Eingebaute Module haben Lösungen in allen Sprachen (TypeScript darf fehlen ⇒ JavaScript)
        expect(Object.keys(task.solutions ?? {}), 'Musterlösungen').toEqual(expect.arrayContaining(['python', 'java', 'javascript', 'csharp']))
        const scenarios = scenarioCount(task)
        const expected: Outcome[] = []
        for (let i = 0; i < scenarios; i++) {
          const run = await runCode(task, 'javascript', task.solutions!.javascript!, i)
          if ('error' in run) throw new Error(`JavaScript, Welt ${i + 1}: ${JSON.stringify(run.error)}`)
          expected.push(run.outcome)
        }
        for (const language of languages) {
          const source = codeSolution(task.solutions!, language)
          for (let i = 0; i < scenarios; i++) {
            const run = await runCode(task, language, source, i)
            expect('error' in run ? run.error : null, `${language}, Welt ${i + 1}`).toBeNull()
            if ('outcome' in run) expect(compareOutcome(task.check, expected[i]!, run.outcome), `${language}, Welt ${i + 1}`).toBeNull()
          }
          if (task.requires?.length) expect(missingCodeConstructs(await outlineOf(language, source), task.requires), language).toEqual([])
        }
        // Die Startvorlage ist nie schon die Lösung
        const starter = []
        for (let i = 0; i < scenarios; i++) starter.push(await runCode(task, 'javascript', starterSource('javascript', module.track, 'en'), i))
        expect(starter.some((run, i) => 'error' in run || compareOutcome(task.check, expected[i]!, run.outcome) !== null)).toBe(true)
      })
    }
  }
})

describe('Lernmodule S', { timeout: 120_000 }, () => {
  for (const module of trackModules('sql')) {
    for (const task of module.tasks) {
      it(`${module.id}/${task.id}`, async () => {
        expect(task.solution, 'Musterlösung').toBeDefined()
        for (const lang of ['de', 'en'] as const) {
          const solution = task.solution![lang]
          expect(missingSqlConstructs(solution, task.requires), lang).toEqual([])
          let unsolvedByNothing = false
          for (let i = 0; i < scenarioCount(task); i++) {
            const run = await runSql(task, solution, i, lang)
            if ('error' in run) throw new Error(`${lang}, Daten ${i + 1}: ${run.error}`)
            // Zweiter Lauf auf frischer Datenbank: gleiches Ergebnis (nichts bleibt hängen)
            const again = await runSql(task, solution, i, lang)
            expect('outcome' in again && compareOutcome(task.check, run.outcome, again.outcome)).toBeNull()
            if (task.check.result) expect(run.outcome.result, `${lang}: Ergebnis mit Spalten`).toBeTruthy()
            const empty = await runSql(task, '', i, lang)
            if ('error' in empty || compareOutcome(task.check, run.outcome, empty.outcome) !== null) unsolvedByNothing = true
          }
          expect(unsolvedByNothing, `${lang}: leeres SQL löst die Aufgabe nicht`).toBe(true)
        }
      })
    }
  }
})
