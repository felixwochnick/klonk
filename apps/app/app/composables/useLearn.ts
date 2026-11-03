import { LEARN_MODULES, type LearnModule, taskKey } from '@klonk/learn'

/** Programm einer Aufgabe: Blöcke (Blockly-JSON) und Klonk-Script getrennt, damit Umschalten nichts löscht */
export type LearnProgram = { language: 'blocks' | 'klonk', blocks: string, klonk: string }

type LearnState = { solved: Record<string, true>, programs: Record<string, LearnProgram> }

const STORAGE_KEY = 'klonk:learn'

// Modulweit: alle Lern-Seiten teilen sich denselben Stand (nur im Browser gespeichert)
const state = ref<LearnState>({ solved: {}, programs: {} })
let loaded = false

function load() {
  if (loaded || import.meta.server) return
  loaded = true
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<LearnState> | null
    if (stored) state.value = { solved: stored.solved ?? {}, programs: stored.programs ?? {} }
  }
  catch {
    // ungültig ⇒ neu beginnen
  }
  watch(state, (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    }
    catch {
      // z. B. privater Modus
    }
  }, { deep: true })
}

/** Fortschritt und Programme der Lernmodule (localStorage `klonk:learn`) */
export function useLearn() {
  load()

  const isSolved = (moduleId: string, taskId: string) => !!state.value.solved[taskKey(moduleId, taskId)]
  const solvedCount = (module: LearnModule) => module.tasks.filter(t => isSolved(module.id, t.id)).length

  function markSolved(moduleId: string, taskId: string) {
    state.value.solved[taskKey(moduleId, taskId)] = true
  }

  /** Gespeichertes Programm (wird beim ersten Zugriff angelegt) */
  function program(moduleId: string, taskId: string): LearnProgram {
    const key = taskKey(moduleId, taskId)
    state.value.programs[key] ??= { language: 'blocks', blocks: '', klonk: '' }
    return state.value.programs[key]
  }

  /** Erste ungelöste Aufgabe des Moduls (sonst die erste) */
  function nextTaskId(module: LearnModule) {
    return (module.tasks.find(t => !isSolved(module.id, t.id)) ?? module.tasks[0]!).id
  }

  /** Aufgabe nach dieser – auch über das Modulende hinweg */
  function following(moduleId: string, taskId: string): { module: string, task: string } | null {
    const m = LEARN_MODULES.findIndex(x => x.id === moduleId)
    const module = LEARN_MODULES[m]
    if (!module) return null
    const t = module.tasks.findIndex(x => x.id === taskId)
    if (module.tasks[t + 1]) return { module: moduleId, task: module.tasks[t + 1]!.id }
    const next = LEARN_MODULES[m + 1]
    return next ? { module: next.id, task: next.tasks[0]!.id } : null
  }

  return { modules: LEARN_MODULES, isSolved, solvedCount, markSolved, program, nextTaskId, following }
}
