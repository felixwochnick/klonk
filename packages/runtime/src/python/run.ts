import type { RobotCommand, SourceRange } from '@klonk/klonk-script'
import { World } from '@klonk/world'
import type { PyodideInterface } from 'pyodide'
import type { FromWorker, ToWorker } from '../protocol'
import { ApiError, createApi } from '../js/api'
import { CONTROL, views } from '../js/shared'
import { PRELUDE, USER_FILE } from './prelude'

/** Zugriffe, die Nutzercode nicht braucht (Python erreicht über das Modul `js` sonst alle Worker-Globals) */
const BLOCKED_GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'WebTransport', 'postMessage', 'onmessage', 'close']

/** Wo die Pyodide-Dateien liegen (eigene Origin wegen COEP; siehe apps/app/nuxt.config.ts) */
export const PYODIDE_URL = '/pyodide/'

/**
 * Führt Python (Pyodide) synchron im Worker aus – gleiche Steuerung wie JS/TS: `sys.settrace` ruft vor
 * jeder Zeile den Prüfpunkt, der über Atomics anhält (Pause, Haltepunkte, Einzelschritt).
 */
export async function runPython(
  message: Extract<ToWorker, { type: 'run' }>,
  post: (message: FromWorker) => void,
  load: () => Promise<PyodideInterface> = loadFromOrigin,
) {
  if (!message.shared) {
    post({ type: 'error', error: { code: 'isolation_required', params: {} } })
    return
  }
  const { control, breakpoints } = views(message.shared)
  let line = 1
  let lastLine = -1
  let lastLinePost = 0
  let stepping = !!message.pauseOnStart
  /** Letzter Fehler aus der Roboter-API – Python sieht ihn nur als JsException */
  let apiError: ApiError | undefined

  let pyodide: PyodideInterface
  try {
    pyodide = await load()
  }
  catch (error) {
    post({ type: 'error', error: { code: 'python_load', params: { message: String((error as Error)?.message ?? error) } } })
    return
  }

  const sleep = (ms: number) => {
    const duration = ms < 0 ? Atomics.load(control, CONTROL.DELAY) : ms
    if (duration > 0) Atomics.wait(control, CONTROL.SLEEP, 0, duration)
  }

  const checkpoint = (current: number, variables: () => Record<string, string>) => {
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
    post({ type: 'paused', range: lineRange(current), variables: variables(), reason: pauseRequested ? 'pause' : atBreakpoint ? 'breakpoint' : 'step' })
    Atomics.wait(control, CONTROL.SIGNAL, 0)
    stepping = Atomics.load(control, CONTROL.SIGNAL) === 2
    post({ type: 'resumed' })
  }

  try {
    const world = new World(message.world)
    const api = createApi({
      world,
      character: message.characterId ?? world.getCharacters()[0]?.id ?? '',
      command: (command: RobotCommand) => post({ type: 'command', command }),
      print: (text: string) => post({ type: 'output', text }),
      sleep,
    })
    // API-Fehler merken, damit sie wie in den anderen Sprachen übersetzt werden
    const robot: Record<string, unknown> = {}
    for (const [name, value] of Object.entries(api)) {
      robot[name] = typeof value !== 'function'
        ? value
        : (...args: unknown[]) => {
            try {
              return (value as (...a: unknown[]) => unknown)(...args)
            }
            catch (error) {
              if (error instanceof ApiError) apiError = error
              throw error
            }
          }
    }
    pyodide.registerJsModule('klonk', robot)
    pyodide.registerJsModule('_klonk_debug', {
      // Variablen erst beim Anhalten auslesen (Python-Funktion ⇒ Dict mit Darstellungen)
      checkpoint: (current: number, variables: { (): { toJs: (o: object) => Record<string, string>, destroy: () => void } }) =>
        checkpoint(current, () => {
          const result = variables()
          const plain = result.toJs({ dict_converter: Object.fromEntries })
          result.destroy()
          return plain
        }),
    })
    pyodide.setStdout({ batched: text => post({ type: 'output', text }) })
    pyodide.setStderr({ batched: text => post({ type: 'output', text }) })

    // Eigene Dateien aus dem Projekt nur mit Lizenz (Bibliotheken) importierbar
    if (message.allowImports) {
      for (const [path, content] of Object.entries(message.files)) {
        if (!path.endsWith('.py') || path.includes('/')) continue
        pyodide.FS.writeFile(`/home/pyodide/${path}`, content)
      }
    }

    // Sandbox: kein Netz, kein Nachladen von Paketen
    const scope = globalThis as unknown as Record<string, unknown>
    for (const name of BLOCKED_GLOBALS) {
      try {
        Object.defineProperty(scope, name, { value: undefined, configurable: true, writable: true })
      }
      catch {
        // nicht überschreibbar – egal
      }
    }

    pyodide.runPython(PRELUDE)
    const globals = pyodide.globals.get('_klonk_user_globals')()
    pyodide.runPython('_klonk_start()')
    try {
      pyodide.runPython(message.source, { globals, filename: USER_FILE })
    }
    finally {
      pyodide.runPython('_klonk_stop()')
      globals.destroy()
    }
    post({ type: 'done' })
  }
  catch (error) {
    post({ type: 'error', error: toRunError(error, apiError, line) })
  }
}

/** Pyodide von der eigenen Origin laden (nicht gebündelt – die App liefert die Dateien unter /pyodide/ aus) */
async function loadFromOrigin() {
  const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_URL}pyodide.mjs`) as typeof import('pyodide')
  return loadPyodide({ indexURL: PYODIDE_URL })
}

/** Python-Ausnahme ⇒ Fehlercode mit Zeile (aus dem Traceback der Nutzerdatei) */
function toRunError(error: unknown, apiError: ApiError | undefined, fallbackLine: number) {
  const text = String((error as Error)?.message ?? error)
  const lines = [...text.matchAll(new RegExp(`File "${USER_FILE}", line (\\d+)`, 'g'))]
  const line = lines.length ? Number(lines.at(-1)![1]) : fallbackLine
  const last = text.trim().split('\n').at(-1) ?? ''
  if (apiError && /JsException/.test(last)) return { code: apiError.code, params: apiError.params, range: lineRange(line) }
  if (/RecursionError/.test(last)) return { code: 'stack_overflow', params: { name: '' }, range: lineRange(line) }
  const match = /^(\w+(?:Error|Exception|Exit|Interrupt)?): ?(.*)$/.exec(last)
  return {
    code: 'py_runtime',
    params: { name: match?.[1] ?? 'Error', message: match?.[2] ?? last },
    range: lineRange(line),
  }
}

function lineRange(line: number): SourceRange {
  return { line, column: 1, endLine: line, endColumn: 1 }
}
