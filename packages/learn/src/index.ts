import { sequence } from './modules/1.sequence'
import { repeat } from './modules/2.repeat'
import { whileLoop } from './modules/3.while'
import { conditions } from './modules/4.conditions'
import { procedures } from './modules/5.procedures'
import { variables } from './modules/6.variables'
import { functions } from './modules/7.functions'
import { paths } from './modules/e1.paths'
import { building } from './modules/e2.building'
import { patterns } from './modules/e3.patterns'
import type { LearnModule } from './types'

export * from './types'
export * from './check'
export { map } from './map'
export * from './project'
export * from './curriculum'

/** Einstieg (E1–E3) und Grundkurs Klonk-Script (1–7) – Reihenfolge = empfohlene Reihenfolge im Unterricht */
export const LEARN_MODULES: LearnModule[] = [paths, building, patterns, sequence, repeat, whileLoop, conditions, procedures, variables, functions]

/** Nummer eines Moduls für Anzeige und Projektnamen: Einstieg „E1“…, Grundkurs „1“… (stabil, wenn Einstiegsmodule dazukommen) */
export function moduleLabel(module: LearnModule | string): string {
  const id = typeof module === 'string' ? module : module.id
  const found = LEARN_MODULES.find(m => m.id === id)
  if (!found) return '?'
  const sameTrack = LEARN_MODULES.filter(m => (m.track ?? 'basic') === (found.track ?? 'basic'))
  const number = sameTrack.indexOf(found) + 1
  return found.track === 'start' ? `E${number}` : String(number)
}

export function findModule(id: string) {
  return LEARN_MODULES.find(m => m.id === id)
}

export function findTask(moduleId: string, taskId: string) {
  return findModule(moduleId)?.tasks.find(t => t.id === taskId)
}
