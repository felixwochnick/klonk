import type { RobotCommand, SourceRange } from '@klonk/klonk-script'
import { World } from '@klonk/world'
import type { FromWorker, ToWorker } from '../protocol'
import { ApiError, createApi, createKlonkClass, display } from './api'
import { CHECKPOINT, InstrumentationError, instrument } from './instrument'
import { CONTROL, views } from './shared'
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
    const vars = Object.fromEntries(Object.entries(variables()).filter(([, v]) => typeof v !== 'function').map(([k, v]) => [k, display(v)]))
    post({ type: 'paused', range: lineRange(current), variables: vars, reason: pauseRequested ? 'pause' : atBreakpoint ? 'breakpoint' : 'step' })
    Atomics.wait(control, CONTROL.SIGNAL, 0)
    stepping = Atomics.load(control, CONTROL.SIGNAL) === 2
    post({ type: 'resumed' })
  }

  try {
    const source = message.language === 'typescript' ? stripTypes(message.source) : message.source
    const code = instrument(source)
    if (/^\s*(import|export)\b/m.test(source) && !message.allowImports) throw new ApiError('feature_libraries')

    const world = new World(message.world)
    const api = createApi({
      world,
      command: (command: RobotCommand) => post({ type: 'command', command }),
      print: (text: string) => post({ type: 'output', text }),
      sleep,
    })

    // Nutzercode bekommt nur die Roboter-API und Standard-JavaScript
    const scope = globalThis as unknown as Record<string, unknown>
    for (const name of BLOCKED_GLOBALS) {
      try {
        Object.defineProperty(scope, name, { value: undefined, configurable: true, writable: true })
      }
      catch {
        // nicht überschreibbar – egal
      }
    }
    for (const [name, value] of Object.entries(api.globals)) scope[name] = value
    scope.Klonk = createKlonkClass(api)
    const print = api.globals.print
    scope.console = { log: print, info: print, warn: print, error: print }

    new Function(CHECKPOINT, `'use strict';${code}`)(checkpoint)
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
