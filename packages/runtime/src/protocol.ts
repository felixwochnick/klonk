import type { RobotDesign, WorldData } from '@klonk/world'
import type { RobotCommand, SourceRange, Value } from '@klonk/klonk-script'
import type { SqlEngineName, SqlResult, SqlValue } from './db/types'
import type { HeapSnapshot } from '@klonk/diagrams'

/** Sprachen, die der Runner ausführen kann */
export type RunLanguage = 'klonk' | 'javascript' | 'typescript' | 'python' | 'java' | 'csharp'

/** Hauptthread ⇒ Worker */
export type ToWorker
  = | {
    type: 'run'
    language: RunLanguage
    source: string
    /** Pfad der Datei im Projekt (für relative Importe, Java-Packages, Python-Module) */
    path?: string
    world: WorldData
    characterId?: string
    breakpoints: number[]
    /** Pause nach jedem Roboterbefehl in ms (passend zur Animation), 0 = so schnell wie möglich */
    delay: number
    /** Bibliotheken erlaubt (Lizenz) und verfügbare Dateien */
    allowImports: boolean
    files: Record<string, string>
    /** Eigene Designs für neue Figuren (Name ⇒ Design); nur mit Lizenz gesetzt – ohne sind eigene Designs gesperrt */
    designs?: Record<string, RobotDesign>
    /** Programme dürfen Designs ins Projekt speichern (Lizenz + geöffnetes Projekt) */
    saveDesigns?: boolean
    /** Höchstzahl der Figuren (Lizenz) */
    maxCharacters?: number
    /** Gleich in der ersten Zeile anhalten */
    pauseOnStart?: boolean
    /** JS/TS/Python/Java/C#: gemeinsamer Speicher für Pause/Haltepunkte/Tempo (siehe js/shared.ts) */
    shared?: SharedArrayBuffer
    /** JS/TS/Python/Java/C#: Antworten der Datenbanken (siehe db/channel.ts) */
    database?: SharedArrayBuffer
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
    /** Datenbankzugriff (`Database.open`, `query` …) – Antwort kommt über den gemeinsamen Speicher */
    | { type: 'db', request: DbRequest }
    /** Programm speichert ein Design im Projekt (`saveDesign`) */
    | { type: 'saveDesign', name: string, design: RobotDesign }
    /** `heap`: Objekte und Verweise für das Objektdiagramm (JS/TS, Python, Java, C#) */
    | { type: 'paused', range: SourceRange, variables: Record<string, Value>, reason: 'breakpoint' | 'step' | 'pause', heap?: HeapSnapshot }
    | { type: 'resumed' }
    | { type: 'error', error: RunError }
    | { type: 'done' }

/** Datenbankzugriff aus Programmen: Projektdatenbank (Dateiname ohne Endung) oder temporäre Datenbank */
export type DbRequest
  = | { op: 'open', name: string }
    | { op: 'memory', engine: SqlEngineName }
    | { op: 'query', handle: number, sql: string, params: SqlValue[] }
    | { op: 'tables', handle: number }

export type DbResponse
  = | { ok: true, handle?: number, name?: string, engine?: SqlEngineName, result?: SqlResult, tables?: string[] }
    /** `sql_error` = Fehler der Datenbank (Meldung in `params.message`), sonst Fehler der API (übersetzt) */
    | { ok: false, code: string, params: Record<string, string | number> }
