import type { RobotCommand, SourceRange, Value } from '@klonk/klonk-script'
import type { World, RobotDesign } from '@klonk/world'
import { CONTROL, createSharedState, views, writeBreakpoints } from './js/shared'
import { createDbBuffer, writeDbResponse } from './db/channel'
import type { DbRequest, DbResponse, FromWorker, RunError, RunLanguage, ToWorker } from './protocol'
import type { HeapSnapshot } from './heap'

export type RunnerState = 'idle' | 'running' | 'paused' | 'done' | 'error' | 'stopped'

export type RunnerSnapshot = {
  state: RunnerState
  /** Zeile, die gerade ausgeführt wird bzw. an der angehalten wurde */
  line: number | null
  pausedRange: SourceRange | null
  variables: Record<string, Value>
  /** Speicherabbild beim (letzten) Anhalten – für das Objektdiagramm */
  heap: HeapSnapshot | null
  output: string[]
  error: RunError | null
}

export type RunOptions = {
  language: RunLanguage
  source: string
  /** Pfad der Datei im Projekt */
  path?: string
  breakpoints?: number[]
  delay?: number
  allowImports?: boolean
  files?: Record<string, string>
  characterId?: string
  pauseOnStart?: boolean
  designs?: Record<string, RobotDesign>
  saveDesigns?: boolean
  maxCharacters?: number
}

/**
 * Steuert die Ausführung im Worker und spiegelt Roboterbefehle auf die angezeigte Welt
 * (die 3D-Ansicht animiert deren Ereignisse). Unabhängig von Vue – `onChange` meldet Zustandswechsel.
 */
export class ProgramRunner {
  private worker?: Worker
  private snapshot: RunnerSnapshot = emptySnapshot()
  /** JS/TS: Steuerung über gemeinsamen Speicher (der Nutzercode blockiert den Worker) */
  private shared?: SharedArrayBuffer

  /** Antworten der Datenbanken für den blockierten Worker */
  private database?: SharedArrayBuffer

  /** Programm speichert ein Design (`saveDesign`) – der Aufrufer schreibt es ins Projekt */
  onSaveDesign?: (name: string, design: RobotDesign) => void
  /** Datenbankzugriff aus Programmen (Projektdatenbanken, temporäre) – ohne Handler gibt es keine Datenbanken */
  onDatabase?: (request: DbRequest) => Promise<DbResponse>

  constructor(
    private createWorker: () => Worker,
    private onChange: (snapshot: RunnerSnapshot) => void,
  ) {}

  get current() {
    return this.snapshot
  }

  /** Startet das Programm auf `world` (vorher auf den Startzustand zurücksetzen!) */
  run(world: World, options: RunOptions) {
    this.terminate()
    this.update({ ...emptySnapshot(), state: 'running' })

    const js = options.language !== 'klonk'
    this.shared = undefined
    this.database = undefined
    if (js) {
      if (typeof SharedArrayBuffer === 'undefined' || !globalThis.crossOriginIsolated) {
        this.update({ state: 'error', error: { code: 'isolation_required', params: {} } })
        return
      }
      this.shared = createSharedState()
      writeBreakpoints(this.shared, options.breakpoints ?? [])
      Atomics.store(views(this.shared).control, CONTROL.DELAY, options.delay ?? 300)
      this.database = createDbBuffer()
    }

    const worker = this.createWorker()
    this.worker = worker
    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      if (this.worker !== worker) return
      this.handle(world, event.data)
    }
    worker.onerror = (event) => {
      this.update({ state: 'error', error: { code: 'internal', params: { message: event.message } } })
      this.terminate()
    }
    this.post({
      type: 'run',
      language: options.language,
      source: options.source,
      path: options.path,
      world: world.toJSON(),
      characterId: options.characterId,
      breakpoints: options.breakpoints ?? [],
      delay: options.delay ?? 300,
      allowImports: options.allowImports ?? false,
      files: options.files ?? {},
      pauseOnStart: options.pauseOnStart,
      designs: options.designs,
      saveDesigns: options.saveDesigns,
      maxCharacters: Number.isFinite(options.maxCharacters) ? options.maxCharacters : undefined,
    }, this.shared, this.database)
  }

  pause() {
    if (this.shared) Atomics.store(views(this.shared).control, CONTROL.PAUSE, 1)
    else this.post({ type: 'pause' })
  }

  resume() {
    if (!this.signal(1)) this.post({ type: 'resume' })
  }

  step() {
    if (!this.signal(2)) this.post({ type: 'step' })
  }

  setBreakpoints(lines: number[]) {
    if (this.shared) writeBreakpoints(this.shared, [...lines])
    else this.post({ type: 'breakpoints', lines })
  }

  setDelay(delay: number) {
    if (this.shared) Atomics.store(views(this.shared).control, CONTROL.DELAY, delay)
    else this.post({ type: 'delay', delay })
  }

  /** JS/TS: angehaltenen Worker wecken (1 = weiter, 2 = Einzelschritt) */
  private signal(value: 1 | 2) {
    if (!this.shared) return false
    const { control } = views(this.shared)
    Atomics.store(control, CONTROL.SIGNAL, value)
    Atomics.notify(control, CONTROL.SIGNAL)
    return true
  }

  stop() {
    if (this.worker && (this.snapshot.state === 'running' || this.snapshot.state === 'paused')) {
      this.terminate()
      this.update({ state: 'stopped', line: null, pausedRange: null })
    }
  }

  dispose() {
    this.terminate()
  }

  private handle(world: World, message: FromWorker) {
    switch (message.type) {
      case 'line':
        this.update({ line: message.line })
        break
      case 'command':
        applyCommand(world, message.command)
        break
      case 'output':
        this.update({ output: [...this.snapshot.output, message.text] })
        break
      case 'saveDesign':
        this.onSaveDesign?.(message.name, message.design)
        break
      case 'db':
        void this.answerDatabase(message.request)
        break
      case 'paused':
        this.update({ state: 'paused', line: message.range.line, pausedRange: message.range, variables: message.variables, heap: message.heap ?? null })
        break
      case 'resumed':
        this.update({ state: 'running', pausedRange: null })
        break
      case 'error':
        this.update({ state: 'error', error: message.error, line: message.error.range?.line ?? null, pausedRange: null })
        this.terminate()
        break
      case 'done':
        this.update({ state: 'done', line: null, pausedRange: null })
        this.terminate()
        break
    }
  }

  /** Datenbankanfrage beantworten – nur, solange derselbe Lauf noch wartet */
  private async answerDatabase(request: DbRequest) {
    const worker = this.worker
    const buffer = this.database
    if (!buffer) return
    let response: DbResponse
    try {
      response = this.onDatabase ? await this.onDatabase(request) : { ok: false, code: 'db_unavailable', params: {} }
    }
    catch (error) {
      response = { ok: false, code: 'internal', params: { message: String((error as Error)?.message ?? error) } }
    }
    if (this.worker === worker && this.database === buffer) writeDbResponse(buffer, response)
  }

  private post(message: ToWorker, shared?: SharedArrayBuffer, database?: SharedArrayBuffer) {
    // Reaktive Proxys (z. B. aus Vue) lassen sich nicht an Worker senden – als einfache Daten kopieren
    const plain = JSON.parse(JSON.stringify(message)) as ToWorker
    if (shared && plain.type === 'run') plain.shared = shared
    if (database && plain.type === 'run') plain.database = database
    this.worker?.postMessage(plain)
  }

  private terminate() {
    this.worker?.terminate()
    this.worker = undefined
  }

  private update(patch: Partial<RunnerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.onChange(this.snapshot)
  }
}

/** Befehl aus dem Worker auf der angezeigten Welt nachspielen */
export function applyCommand(world: World, command: RobotCommand) {
  switch (command.name) {
    case 'placeBrick':
      world.placeBrick(command.id, command.color)
      break
    case 'setMark':
      world.setMark(command.id, command.color)
      break
    case 'createCharacter':
      world.addCharacter(command.character)
      break
    default:
      world[command.name](command.id)
  }
}

function emptySnapshot(): RunnerSnapshot {
  return { state: 'idle', line: null, pausedRange: null, variables: {}, heap: null, output: [], error: null }
}
