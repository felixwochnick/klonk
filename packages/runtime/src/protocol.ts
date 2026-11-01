import type { WorldData } from '@klonk/world'
import type { RobotCommand, SourceRange, Value } from '@klonk/klonk-script'

/** Sprachen, die der Runner ausführen kann (später: javascript, typescript, python …) */
export type RunLanguage = 'klonk'

/** Hauptthread ⇒ Worker */
export type ToWorker
  = | {
    type: 'run'
    language: RunLanguage
    source: string
    world: WorldData
    characterId?: string
    breakpoints: number[]
    /** Pause nach jedem Roboterbefehl in ms (passend zur Animation), 0 = so schnell wie möglich */
    delay: number
    /** Bibliotheken erlaubt (Lizenz) und verfügbare Dateien */
    allowImports: boolean
    files: Record<string, string>
    /** Gleich in der ersten Zeile anhalten */
    pauseOnStart?: boolean
  }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'step' }
  | { type: 'breakpoints', lines: number[] }
  | { type: 'delay', delay: number }

export type RunError = { code: string, params: Record<string, string | number>, range?: SourceRange }

/** Worker ⇒ Hauptthread */
export type FromWorker
  = | { type: 'line', line: number }
    | { type: 'command', command: RobotCommand }
    | { type: 'output', text: string }
    | { type: 'paused', range: SourceRange, variables: Record<string, Value>, reason: 'breakpoint' | 'step' | 'pause' }
    | { type: 'resumed' }
    | { type: 'error', error: RunError }
    | { type: 'done' }
