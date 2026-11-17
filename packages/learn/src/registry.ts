import { paths } from './modules/basics/1.paths'
import { building } from './modules/basics/2.building'
import { patterns } from './modules/basics/3.patterns'
import { sequence } from './modules/basics/4.sequence'
import { repeat } from './modules/basics/5.repeat'
import { whileLoop } from './modules/basics/6.while'
import { conditions } from './modules/basics/7.conditions'
import { procedures } from './modules/basics/8.procedures'
import { variables } from './modules/basics/9.variables'
import { functions } from './modules/basics/10.functions'
import { characters } from './modules/basics/11.characters'
import { nestedLoops } from './modules/basics/12.nested-loops'
import { algorithms } from './modules/basics/13.algorithms'
import { codeStart } from './modules/advanced/1.start'
import { codeVariables } from './modules/advanced/2.variables'
import { codeMethods } from './modules/advanced/3.methods'
import { codeObjects } from './modules/advanced/4.objects'
import { codeLists } from './modules/advanced/5.lists'
import { codeClasses } from './modules/advanced/6.classes'
import { codeInheritance } from './modules/advanced/7.inheritance'
import { codeRecursion } from './modules/advanced/8.recursion'
import { sqlSelect } from './modules/sql/1.select'
import { sqlModify } from './modules/sql/2.modify'
import { sqlFilter } from './modules/sql/3.filter'
import { sqlAggregate } from './modules/sql/4.aggregate'
import { sqlJoin } from './modules/sql/5.join'
import { sqlCreate } from './modules/sql/6.create'
import { sqlSubquery } from './modules/sql/7.subquery'
import { appQuery } from './modules/apps/1.query'
import { appUpdate } from './modules/apps/2.update'
import { appWorld } from './modules/apps/3.world'
import { appObjects } from './modules/apps/4.objects'
import { LEARN_TRACKS, TRACK_CODES, type LearnModule, type LearnTrack } from './types'

/**
 * Alle Lernmodule, je Reihe in Kursreihenfolge (E1, E2 … F1 … S1 … A1 …). Die IDs stehen in der Datenbank (Freigaben,
 * Modulprojekte) – nie ändern.
 */
export const LEARN_MODULES: LearnModule[] = [
  // E – Einfach: Klonk-Script & Blöcke (E1–E3 Einstieg mit Welten zum Anfassen, ab E4 Grundkurs)
  paths, building, patterns, sequence, repeat, whileLoop, conditions, procedures, variables, functions, characters, nestedLoops, algorithms,
  // F – Fortgeschritten: Python, Java, JavaScript, TypeScript, C#
  codeStart, codeVariables, codeMethods, codeObjects, codeLists, codeClasses, codeInheritance, codeRecursion,
  // S – SQL
  sqlSelect, sqlModify, sqlFilter, sqlAggregate, sqlJoin, sqlCreate, sqlSubquery,
  // A – Anwendungen: Programm und Datenbank
  appQuery, appUpdate, appWorld, appObjects,
]

export function findModule(id: string) {
  return LEARN_MODULES.find(m => m.id === id)
}

export function findTask(moduleId: string, taskId: string) {
  return findModule(moduleId)?.tasks.find(t => t.id === taskId)
}

/** Module einer Reihe in Kursreihenfolge */
export const trackModules = (track: LearnTrack) => LEARN_MODULES.filter(m => m.track === track)

/** Kürzel eines Moduls, z. B. „E1“, „S3“ (unbekannt ⇒ leer) */
export function moduleCode(id: string) {
  const module = findModule(id)
  if (!module) return ''
  return `${TRACK_CODES[module.track]}${trackModules(module.track).indexOf(module) + 1}`
}

/** Kürzel eines Moduls: eingebaute aus der Reihe, eigene wie von der Lehrkraft gewählt (auch leer) */
export const codeOf = (module: { id: string, code?: string }) => module.code ?? moduleCode(module.id)

/** Modul-IDs in Kursreihenfolge (Reihen nacheinander) */
export const moduleOrder = () => LEARN_TRACKS.flatMap(track => trackModules(track).map(m => m.id))
