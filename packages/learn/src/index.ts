import { sequence } from './modules/1.sequence'
import { repeat } from './modules/2.repeat'
import { whileLoop } from './modules/3.while'
import { conditions } from './modules/4.conditions'
import { procedures } from './modules/5.procedures'
import { variables } from './modules/6.variables'
import type { LearnModule } from './types'

export * from './types'
export * from './check'
export { map } from './map'
export * from './project'

/** Grundkurs Klonk-Script – Reihenfolge = empfohlene Reihenfolge im Unterricht */
export const LEARN_MODULES: LearnModule[] = [sequence, repeat, whileLoop, conditions, procedures, variables]

export function findModule(id: string) {
  return LEARN_MODULES.find(m => m.id === id)
}

export function findTask(moduleId: string, taskId: string) {
  return findModule(moduleId)?.tasks.find(t => t.id === taskId)
}
