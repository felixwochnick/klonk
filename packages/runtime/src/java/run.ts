import type { RobotCommand, SourceRange, Value } from '@klonk/klonk-script'
import { World } from '@klonk/world'
import type { FromWorker, RunError, ToWorker } from '../protocol'
import { ApiError, createApi } from '../js/api'
import { CONTROL, views } from '../js/shared'
import { instrumentJava } from './instrument'
import { ROBOT_IMPORT, ROBOT_JAVA } from './robot'

/** Wo teavm-javac liegt (eigene Origin wegen COEP; siehe apps/app/nuxt.config.ts) */
export const TEAVM_URL = '/teavm/'

/** Zugriffe, die Nutzercode nicht braucht (über JSO erreichbar) */
const BLOCKED_GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'WebTransport', 'postMessage', 'onmessage', 'close']

type Diagnostic = { type: string, severity: string, fileName: string, lineNumber: number, message: string }
type Compiler = {
  setSdk(content: Int8Array): void
  setTeaVMClasslib(content: Int8Array): void
  addSourceFile(path: string, content: string): void
  onDiagnostic(listener: (d: Diagnostic) => void): void
  compile(): boolean
  detectMainClasses(): ArrayLike<string>
  generateWebAssembly(options: { outputName: string, mainClass: string }): boolean
  getWebAssemblyOutputFile(path: string): Int8Array
}
type TeaVMLoad = (module: string | ArrayBufferView, options?: { installImports?: (imports: Record<string, Record<string, unknown>>) => void }) =>
Promise<{ exports: Record<string, (...args: unknown[]) => unknown> }>

/** Laden von Compiler und Klassenbibliotheken (im Test aus dem Dateisystem) */
export type JavaToolchain = { load: TeaVMLoad, compiler: string | ArrayBufferView, sdk: Int8Array, classlib: Int8Array }

/**
 * Java im Worker: teavm-javac kompiliert das Programm (instrumentiert mit Prüfpunkten) zu WebAssembly,
 * das dann synchron läuft. Steuerung wie JS/Python über SharedArrayBuffer/Atomics.
 */
export async function runJava(
  message: Extract<ToWorker, { type: 'run' }>,
  post: (message: FromWorker) => void,
  toolchain: () => Promise<JavaToolchain> = loadFromOrigin,
) {
  if (!message.shared) {
    post({ type: 'error', error: { code: 'isolation_required', params: {} } })
    return
  }
  const { control, breakpoints } = views(message.shared)

  let tools: JavaToolchain
  try {
    tools = await toolchain()
  }
  catch (error) {
    post({ type: 'error', error: { code: 'java_load', params: { message: String((error as Error)?.message ?? error) } } })
    return
  }

  // Übersetzen
  const { main, files } = javaFiles(message)
  const errors: Diagnostic[] = []
  let app: Int8Array
  try {
    const compiler = (await tools.load(tools.compiler)).exports.createCompiler!() as Compiler
    compiler.setSdk(tools.sdk)
    compiler.setTeaVMClasslib(tools.classlib)
    compiler.onDiagnostic((d) => {
      // Felder einzeln und defensiv lesen (manche Diagnosen haben nicht alle)
      const read = <T>(fn: () => T, fallback: T) => {
        try {
          return fn() ?? fallback
        }
        catch {
          return fallback
        }
      }
      if (read(() => d.severity, '') === 'error') {
        errors.push({ type: read(() => d.type, ''), severity: 'error', fileName: read(() => d.fileName, ''), lineNumber: read(() => d.lineNumber, 0), message: read(() => d.message, '') })
      }
    })
    compiler.addSourceFile('Robot.java', ROBOT_JAVA)
    for (const [name, source] of Object.entries(files)) compiler.addSourceFile(name, source)
    const compileError = (): RunError => {
      const first = errors.find(e => e.fileName.endsWith(main)) ?? errors[0]
      const line = first?.lineNumber || 1
      return { code: 'java_compile', params: { message: first?.message ?? '' }, range: first?.fileName.endsWith(main) ? lineRange(line) : undefined }
    }
    if (!compiler.compile()) {
      post({ type: 'error', error: compileError() })
      return
    }
    const mainClass = Array.from(compiler.detectMainClasses()).find(c => c !== 'klonk.Robot')
    if (!mainClass) {
      post({ type: 'error', error: { code: 'java_no_main', params: {} } })
      return
    }
    if (!compiler.generateWebAssembly({ outputName: 'app', mainClass })) {
      post({ type: 'error', error: compileError() })
      return
    }
    app = compiler.getWebAssemblyOutputFile('app.wasm')
  }
  catch (error) {
    post({ type: 'error', error: { code: 'java_compile', params: { message: String((error as Error)?.message ?? error) } } })
    return
  }

  // Ausführen
  let line = 1
  let lastLine = -1
  let lastLinePost = 0
  let stepping = !!message.pauseOnStart
  let pauseReason: 'pause' | 'breakpoint' | 'step' = 'step'
  let variables: Record<string, Value> = {}
  let apiError: ApiError | undefined

  const sleep = (ms: number) => {
    const duration = ms < 0 ? Atomics.load(control, CONTROL.DELAY) : ms
    if (duration > 0) Atomics.wait(control, CONTROL.SLEEP, 0, duration)
  }

  const world = new World(message.world)
  const api = createApi({
    world,
    character: message.characterId ?? world.getCharacters()[0]?.id ?? '',
    command: (command: RobotCommand) => post({ type: 'command', command }),
    print: (text: string) => post({ type: 'output', text }),
    sleep,
  })
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
  robot.sleepSeconds = robot.wait
  // Prüfpunkt: true ⇒ anhalten (Variablen folgen über variable(), dann pause())
  robot.checkpoint = (current: number) => {
    line = current
    const atBreakpoint = breakpoints[current] === 1 && current !== lastLine
    if (Atomics.load(control, CONTROL.DELAY) > 0 && current !== lastLine && performance.now() - lastLinePost >= 50) {
      post({ type: 'line', line: current })
      lastLinePost = performance.now()
    }
    lastLine = current
    const pauseRequested = Atomics.load(control, CONTROL.PAUSE) === 1
    if (!pauseRequested && !stepping && !atBreakpoint) return false
    pauseReason = pauseRequested ? 'pause' : atBreakpoint ? 'breakpoint' : 'step'
    variables = {}
    return true
  }
  robot.variable = (name: string, value: string) => {
    variables[name] = value
  }
  robot.pause = () => {
    Atomics.store(control, CONTROL.PAUSE, 0)
    Atomics.store(control, CONTROL.SIGNAL, 0)
    post({ type: 'paused', range: lineRange(line), variables, reason: pauseReason })
    Atomics.wait(control, CONTROL.SIGNAL, 0)
    stepping = Atomics.load(control, CONTROL.SIGNAL) === 2
    post({ type: 'resumed' })
  }

  // Ausgabe zeilenweise (System.out/err kommen Zeichen für Zeichen)
  let stdout = ''
  const putchar = (code: number) => {
    if (code === 10) {
      post({ type: 'output', text: stdout })
      stdout = ''
    }
    else {
      stdout += String.fromCharCode(code)
    }
  }

  try {
    const scope = globalThis as unknown as Record<string, unknown>
    const program = await tools.load(app, {
      installImports(imports) {
        imports.teavmConsole!.putcharStdout = putchar
        imports.teavmConsole!.putcharStderr = putchar
      },
    })
    // Robot.java liest `window.klonk` (JSO kennt im Worker kein anderes globales Objekt)
    scope.window = globalThis
    scope.klonk = robot
    for (const name of BLOCKED_GLOBALS) {
      try {
        Object.defineProperty(scope, name, { value: undefined, configurable: true, writable: true })
      }
      catch {
        // nicht überschreibbar – egal
      }
    }
    program.exports.main!([])
    if (stdout) post({ type: 'output', text: stdout })
    post({ type: 'done' })
  }
  catch (error) {
    if (stdout) post({ type: 'output', text: stdout })
    post({ type: 'error', error: toRunError(error, apiError, line) })
  }
}

/** Hauptdatei (+ mit Lizenz weitere .java-Dateien des Projekts), instrumentiert, mit Import der Roboter-API */
function javaFiles(message: Extract<ToWorker, { type: 'run' }>) {
  const prepare = (source: string) => {
    const instrumented = instrumentJava(source) ?? source
    // Import nach einer package-Anweisung, sonst ganz vorne – in derselben Zeile
    const pkg = /^\s*package\s+[\w.]+\s*;/.exec(instrumented)
    const at = pkg ? pkg[0].length : 0
    return `${instrumented.slice(0, at)}${at ? ' ' : ''}${ROBOT_IMPORT}${instrumented.slice(at)}`
  }
  const main = `${publicClass(message.source) ?? 'Main'}.java`
  const files: Record<string, string> = { [main]: prepare(message.source) }
  if (message.allowImports) {
    for (const [path, source] of Object.entries(message.files)) {
      if (!path.endsWith('.java') || path.includes('/')) continue
      const name = `${publicClass(source) ?? path.slice(0, -5)}.java`
      if (name !== main) files[name] = prepare(source)
    }
  }
  return { main, files }
}

function publicClass(source: string) {
  return /\bpublic\s+(?:final\s+|abstract\s+)*(?:class|interface|enum|record)\s+(\w+)/.exec(source)?.[1]
}

function toRunError(error: unknown, apiError: ApiError | undefined, line: number): RunError {
  if (error instanceof ApiError) return { code: error.code, params: error.params, range: lineRange(line) }
  if (apiError) return { code: apiError.code, params: apiError.params, range: lineRange(line) }
  if (error instanceof RangeError && /call stack/i.test(error.message)) return { code: 'stack_overflow', params: { name: '' }, range: lineRange(line) }
  const text = String((error as Error)?.message ?? error)
  return { code: 'java_runtime', params: { message: text }, range: lineRange(line) }
}

async function loadFromOrigin(): Promise<JavaToolchain> {
  const { load } = await import(/* @vite-ignore */ `${TEAVM_URL}compiler.wasm-runtime.js`) as { load: TeaVMLoad }
  const bin = async (name: string) => {
    const response = await fetch(`${TEAVM_URL}${name}`)
    if (!response.ok) throw new Error(`${name}: ${response.status}`)
    return new Int8Array(await response.arrayBuffer())
  }
  // Als Bytes übergeben: bei einer URL nimmt der TeaVM-Loader Node an, sobald `process` existiert (Vite-Worker)
  const [compiler, sdk, classlib] = await Promise.all([bin('compiler.wasm'), bin('compile-classlib-teavm.bin'), bin('runtime-classlib-teavm.bin')])
  return { load, compiler, sdk, classlib }
}

function lineRange(line: number): SourceRange {
  return { line, column: 1, endLine: line, endColumn: 1 }
}
