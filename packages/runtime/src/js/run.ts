import type { RobotCommand, SourceRange } from '@klonk/klonk-script'
import { World } from '@klonk/world'
import type { FromWorker, ToWorker } from '../protocol'
import { jsHeap } from '../heap'
import { ApiError, createApi, createDatabaseClass, createKlonkClass, display } from './api'
import { createDbCall } from '../db/channel'
import { CHECKPOINT, InstrumentationError, instrument } from './instrument'
import { CONTROL, views } from './shared'
import { EXPORT, IMPORT, createNamespace, resolveImport, transformModule, type ModuleNamespace } from './modules'
import { stripTypes } from './transpile'

/** Zugriffe, die Nutzercode nicht braucht und die er nicht haben soll (Netzwerk, Speicher, weitere Skripte) */
const BLOCKED_GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'WebTransport', 'navigator', 'postMessage', 'onmessage', 'close']

/**
 * Führt JavaScript/TypeScript synchron im Worker aus. Prüfpunkte vor jeder Anweisung halten über
 * Atomics an (Pause, Haltepunkte, Einzelschritt); Roboterbefehle warten per Atomics.wait auf die Animation.
 */
export function runJavaScript(message: Extract<ToWorker, { type: 'run' }>, post: (message: FromWorker) => void) {
  if (!message.shared) {
    post({ type: 'error', error: { code: 'isolation_required', params: {} } })
    return
  }
  const { control, breakpoints } = views(message.shared)
  let line = 1
  let lastLine = -1
  let lastLinePost = 0
  let stepping = !!message.pauseOnStart

  const sleep = (ms: number) => {
    const duration = ms < 0 ? Atomics.load(control, CONTROL.DELAY) : ms
    if (duration > 0) Atomics.wait(control, CONTROL.SLEEP, 0, duration)
  }

  const checkpoint = (current: number, variables: () => Record<string, unknown>) => {
    line = current
    const atBreakpoint = breakpoints[current] === 1 && current !== lastLine
    if (Atomics.load(control, CONTROL.DELAY) > 0 && current !== lastLine && performance.now() - lastLinePost >= 50) {
      post({ type: 'line', line: current })
      lastLinePost = performance.now()
    }
    lastLine = current

    const pauseRequested = Atomics.load(control, CONTROL.PAUSE) === 1
    if (!pauseRequested && !stepping && !atBreakpoint) return
    Atomics.store(control, CONTROL.PAUSE, 0)
    Atomics.store(control, CONTROL.SIGNAL, 0)
    const raw = Object.fromEntries(Object.entries(variables()).filter(([, v]) => typeof v !== 'function'))
    const vars = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, display(v)]))
    post({ type: 'paused', range: lineRange(current), variables: vars, reason: pauseRequested ? 'pause' : atBreakpoint ? 'breakpoint' : 'step', heap: jsHeap(raw) })
    Atomics.wait(control, CONTROL.SIGNAL, 0)
    stepping = Atomics.load(control, CONTROL.SIGNAL) === 2
    post({ type: 'resumed' })
  }

  try {
    const main = message.path ?? (message.language === 'typescript' ? 'main.ts' : 'main.js')
    const toScript = (path: string, text: string) => transformModule(/\.ts$/.test(path) || (path === main && message.language === 'typescript') ? stripTypes(text) : text)
    const code = instrument(toScript(main, message.source))

    const world = new World(message.world)
    const api = createApi({
      world,
      command: (command: RobotCommand) => post({ type: 'command', command }),
      print: (text: string) => post({ type: 'output', text }),
      sleep,
      designs: message.designs,
      maxCharacters: message.maxCharacters,
      saveDesign: message.saveDesigns ? (name, design) => post({ type: 'saveDesign', name, design }) : undefined,
      database: createDbCall(message.database, post),
    })
    // Bibliothek "klonk": Klassen Klonk und Database, wait, Farben und Designs – nur per import verfügbar; Ausgabe mit console.log
    const klonk: ModuleNamespace = { ...api.globals, Klonk: createKlonkClass(api), Database: createDatabaseClass(api) }
    klonk.default = klonk

    // Projektdateien (nur mit Lizenz): ohne Prüfpunkte, je Datei einmal ausgeführt
    const modules = new Map<string, ModuleNamespace>()
    const load = (from: string) => (specifier: string): ModuleNamespace => {
      if (specifier === 'klonk') return klonk
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) throw new ApiError('js_module_not_found', { name: specifier })
      if (!message.allowImports) throw new ApiError('feature_libraries')
      const path = resolveImport(from, specifier, message.files)
      if (!path) throw new ApiError('js_module_not_found', { name: specifier })
      const cached = modules.get(path)
      if (cached) return cached
      const { namespace, register } = createNamespace()
      modules.set(path, namespace)
      new Function(IMPORT, EXPORT, `'use strict';${toScript(path, message.files[path]!)}`)(load(path), register)
      return namespace
    }
    const { namespace, register } = createNamespace()
    modules.set(main, namespace)

    // Nutzercode bekommt nur Standard-JavaScript (die Roboter-API kommt über import)
    const scope = globalThis as unknown as Record<string, unknown>
    for (const name of BLOCKED_GLOBALS) {
      try {
        Object.defineProperty(scope, name, { value: undefined, configurable: true, writable: true })
      }
      catch {
        // nicht überschreibbar – egal
      }
    }
    const print = api.print
    scope.console = { log: print, info: print, warn: print, error: print }

    new Function(CHECKPOINT, IMPORT, EXPORT, `'use strict';${code}`)(checkpoint, load(main), register)
    post({ type: 'done' })
  }
  catch (error) {
    if (error instanceof InstrumentationError) {
      const { code, message: text, line: l, column } = error.detail
      post({ type: 'error', error: { code, params: { message: text }, range: { line: l, column, endLine: l, endColumn: column + 1 } } })
    }
    else if (error instanceof ApiError) {
      post({ type: 'error', error: { code: error.code, params: error.params, range: lineRange(line) } })
    }
    else {
      const e = error as Error
      const tooDeep = e instanceof RangeError && /call stack/i.test(e.message)
      post({
        type: 'error',
        error: tooDeep
          ? { code: 'stack_overflow', params: { name: '' }, range: lineRange(line) }
          : { code: 'js_runtime', params: { name: e?.name ?? 'Error', message: e?.message ?? String(error) }, range: lineRange(line) },
      })
    }
  }
}

function lineRange(line: number): SourceRange {
  return { line, column: 1, endLine: line, endColumn: 1 }
}
