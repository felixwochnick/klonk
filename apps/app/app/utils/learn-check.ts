import { compareOutcome, missingConstructs, type CheckFailure, type Construct, type LearnTask, type Outcome } from '@klonk/learn'
import { ProgramRunner, type RunError } from '@klonk/runtime'
import RunnerWorker from '@klonk/runtime/worker?worker'
import { KlonkError } from '@klonk/klonk-script'
import { World, type WorldData } from '@klonk/world'

/** Ergebnis der Prüfung einer Aufgabe – `world` = Index der Startwelt, in der es scheitert */
export type LearnCheckResult
  = | { status: 'solved' }
    | { status: 'syntax', error: RunError }
    | { status: 'missing', constructs: Construct[] }
    | { status: 'failed', world: number, failure: CheckFailure }
    | { status: 'error', world: number, error: RunError }
    | { status: 'timeout', world: number }

type HeadlessResult = { outcome: Outcome } | { error: RunError } | { timeout: true }

/** Führt das Programm ohne Animation im Worker aus (Endlosschleifen ⇒ Zeitlimit) */
function runHeadless(source: string, start: WorldData, maxCharacters: number, timeout = 5000): Promise<HeadlessResult> {
  return new Promise((resolve) => {
    const world = new World(start)
    const runner = new ProgramRunner(() => new RunnerWorker(), (snapshot) => {
      if (snapshot.state === 'done') finish({ outcome: { world: world.toJSON(), output: snapshot.output } })
      else if (snapshot.state === 'error' && snapshot.error) finish({ error: snapshot.error })
    })
    function finish(result: HeadlessResult) {
      clearTimeout(timer)
      runner.dispose()
      resolve(result)
    }
    const timer = setTimeout(() => finish({ timeout: true }), timeout)
    runner.run(world, { language: 'klonk', source, delay: 0, breakpoints: [], allowImports: false, files: {}, maxCharacters })
  })
}

/** Prüft ein Programm (Klonk-Script, auch aus Blöcken erzeugt) gegen alle Startwelten der Aufgabe */
export async function checkTask(task: LearnTask, expected: Outcome[], source: string, maxCharacters: number): Promise<LearnCheckResult> {
  try {
    const missing = missingConstructs(source, task.requires)
    if (missing.length) return { status: 'missing', constructs: missing }
  }
  catch (error) {
    if (error instanceof KlonkError) return { status: 'syntax', error: { code: error.code, params: error.params, range: error.range } }
    throw error
  }
  for (const [i, start] of task.worlds.entries()) {
    const result = await runHeadless(source, start, maxCharacters)
    if ('timeout' in result) return { status: 'timeout', world: i }
    if ('error' in result) return { status: 'error', world: i, error: result.error }
    const failure = compareOutcome(task.check, start, expected[i]!, result.outcome)
    if (failure) return { status: 'failed', world: i, failure }
  }
  return { status: 'solved' }
}
