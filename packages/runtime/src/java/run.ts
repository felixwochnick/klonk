import type { RobotCommand, SourceRange, Value } from '@klonk/klonk-script'
import { assetUrl } from '../assets'
import { World } from '@klonk/world'
import type { HeapSnapshot } from '../heap'
import type { FromWorker, RunError, ToWorker } from '../protocol'
import { ApiError, createApi } from '../js/api'
import { CONTROL, views } from '../js/shared'
import { createDbCall } from '../db/channel'
import { instrumentJava, javaClassNames } from './instrument'
import { JAVA_LIBRARY } from './lib'
import { DEBUG_IMPORT, DEBUG_JAVA, ROBOT_JAVA } from './robot'

/** Wo teavm-javac liegt (eigene Origin wegen COEP; siehe apps/app/nuxt.config.ts) */
export const TEAVM_URL = assetUrl('teavm')

/** Zugriffe, die Nutzercode nicht braucht (über JSO erreichbar) */
const BLOCKED_GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'WebTransport', 'postMessage', 'onmessage', 'close']

export type Diagnostic = { type: string, severity: string, fileName: string, lineNumber: number, columnNumber?: number, startPosition?: number, endPosition?: number, message: string }
export type Compiler = {
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
    compiler.addSourceFile('Klonk.java', ROBOT_JAVA)
    compiler.addSourceFile('Debug.java', DEBUG_JAVA)
    for (const [name, source] of Object.entries(JAVA_LIBRARY)) compiler.addSourceFile(name, source)
    for (const [name, source] of Object.entries(files)) compiler.addSourceFile(name, source)
    const compileError = (): RunError => {
      const first = errors.find(e => e.fileName.endsWith(main)) ?? errors[0]
      const line = first?.lineNumber || 1
      // Ohne Lizenz fehlen die anderen Projektdateien – dann das sagen statt „package … does not exist“
      if (first && !message.allowImports && usesProjectJava(first.message, message)) return { code: 'feature_libraries', params: {}, range: lineRange(line) }
      return { code: 'java_compile', params: { message: friendlyJavacMessage(first?.message ?? '') }, range: first?.fileName.endsWith(main) ? lineRange(line) : undefined }
    }
    if (!compiler.compile()) {
      post({ type: 'error', error: compileError() })
      return
    }
    // Startklasse: die der geöffneten Datei (mit Package), sonst die erste mit main()
    const mains = Array.from(compiler.detectMainClasses(), c => c.replace(/\//g, '.')).filter(c => !c.startsWith('klonk.'))
    const own = publicClass(message.source) ?? main.slice(0, -5)
    const pkg = packageOf(message.source) ?? DEFAULT_PACKAGE
    const mainClass = mains.find(c => c === (pkg ? `${pkg}.${own}` : own)) ?? mains[0]
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
    command: (command: RobotCommand) => post({ type: 'command', command }),
    print: (text: string) => post({ type: 'output', text }),
    sleep,
    designs: message.designs,
    maxCharacters: message.maxCharacters,
    saveDesign: message.saveDesigns ? (name, design) => post({ type: 'saveDesign', name, design }) : undefined,
    database: createDbCall(message.database, post),
    onError: (error) => {
      apiError = error
    },
  })
  // Gegenstück zu den JSO-Schnittstellen in Klonk.java
  const robot: Record<string, unknown> = {
    robot: (name: string) => api.robot(name),
    robotAt: (number: number) => api.robot(number),
    first: () => api.robot(),
    create: (name: string, look: string | null, x: number, y: number) => api.create(name, look ?? undefined, x, y),
    loadDesign: api.globals.loadDesign,
    saveDesign: api.globals.saveDesign,
    count: () => api.names().length,
    nameAt: (index: number) => api.names()[index],
    sleepSeconds: api.globals.wait,
    // Database.java: Anfrage/Antwort als JSON-Text
    db: api.db.json,
  }
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
  // Speicherabbild fürs Objektdiagramm (JSON aus Debug.java, kommt direkt vor pause())
  let heap: HeapSnapshot | undefined
  robot.heap = (json: string) => {
    try {
      heap = JSON.parse(String(json)) as HeapSnapshot
    }
    catch {
      heap = undefined
    }
  }
  robot.pause = () => {
    Atomics.store(control, CONTROL.PAUSE, 0)
    Atomics.store(control, CONTROL.SIGNAL, 0)
    post({ type: 'paused', range: lineRange(line), variables, reason: pauseReason, heap })
    heap = undefined
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
    // Klonk.java liest `window.klonk` (JSO kennt im Worker kein anderes globales Objekt)
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

/** Hauptdatei (+ mit Lizenz weitere .java-Dateien des Projekts, auch aus Unterordnern – der Compiler sieht sie flach), instrumentiert, mit Import der Roboter-API */
function javaFiles(message: Extract<ToWorker, { type: 'run' }>) {
  const sources = [message.source, ...(message.allowImports ? Object.entries(message.files).filter(([path]) => path.endsWith('.java')).map(([, source]) => source) : [])]
  const own = javaClassNames(sources)
  const prepare = (source: string) => withPackage(instrumentJava(source, own) ?? source, DEBUG_IMPORT)
  const main = `${publicClass(message.source) ?? 'Main'}.java`
  const files: Record<string, string> = { [main]: prepare(message.source) }
  if (message.allowImports) {
    for (const [path, source] of Object.entries(message.files)) {
      if (!path.endsWith('.java')) continue
      const name = `${publicClass(source) ?? path.slice(path.lastIndexOf('/') + 1, -5)}.java`
      if (name !== main) files[name] = prepare(source)
    }
  }
  return { main, files }
}

/** Fehlt der Import einer Klonk-Klasse, das dazusagen; das interne Paket `_default` nicht zeigen */
export function friendlyJavacMessage(message: string) {
  const KLONK = '(Klonk|Json|JsonObject|JsonArray|JsonException|Yaml|Xml)'
  const missing = new RegExp(`bad source file: ${KLONK}\\.java`).exec(message)?.[1] ?? new RegExp(`symbol:\\s+class ${KLONK}\\b`).exec(message)?.[1]
  return missing ? `cannot find symbol: class ${missing} (missing import klonk.${missing};?)` : message.replace(/\b_default\./g, '')
}

/** Bezieht sich ein Compilerfehler auf Packages/Klassen anderer Projektdateien? */
function usesProjectJava(error: string, message: Extract<ToWorker, { type: 'run' }>) {
  const others = Object.entries(message.files).filter(([path, source]) => path.endsWith('.java') && source !== message.source)
  const packages = new Set(others.map(([, source]) => packageOf(source)).filter(Boolean) as string[])
  const classes = new Set(others.map(([path, source]) => publicClass(source) ?? path.slice(path.lastIndexOf('/') + 1, -5)))
  const pkg = /package ([\w.]+) does not exist/.exec(error)?.[1]
  if (pkg && [...packages].some(p => p === pkg || p.startsWith(`${pkg}.`))) return true
  const symbol = /symbol:\s+(?:class|variable) (\w+)/.exec(error)?.[1]
  return !!symbol && (classes.has(symbol) || [...packages].some(p => p.split('.')[0] === symbol))
}

/**
 * Klassen ohne `package` kompiliert Klonk im Paket `_default`: Der Browser-javac legt alle Dateien flach in den
 * Quellpfad, sucht einfache Namen aber zuerst im Standardpaket – dort fände er `Laufen.java` aus `package
 * Werkzeuge` und bräche ab („bad source file“), statt `import Werkzeuge.*;` bzw. `import klonk.*;` zu folgen.
 */
export const DEFAULT_PACKAGE = '_default'

/**
 * Text direkt hinter der package-Anweisung einfügen (fehlt sie, mit `package _default;` davor) – alles in der Zeile
 * der package-Anweisung bzw. in Zeile 1, damit die Zeilennummern gleich bleiben. Liefert auch, wie viele Zeichen in
 * Zeile 1 vorne dazukamen (für Spaltenangaben).
 */
export function withPackage(source: string, insert = '') {
  const match = PACKAGE.exec(source)
  if (match) return `${source.slice(0, match.index + match[0].length)} ${insert}${source.slice(match.index + match[0].length)}`
  return `package ${DEFAULT_PACKAGE}; ${insert}${source}`
}
/** Zusätzliche Zeichen in Zeile 1 durch `withPackage` (nur ohne eigene package-Anweisung) */
export function packagePrefixLength(source: string, insert = '') {
  return PACKAGE.test(source) ? 0 : `package ${DEFAULT_PACKAGE}; ${insert}`.length
}

const PACKAGE = /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*package\s+[\w.]+\s*;/

/** Package einer Java-Datei (`package de.schule.aufgabe;`) */
export function packageOf(source: string) {
  return /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*package\s+([\w.]+)\s*;/.exec(source)?.[1]
}

export function publicClass(source: string) {
  return /\bpublic\s+(?:final\s+|abstract\s+)*(?:class|interface|enum|record)\s+(\w+)/.exec(source)?.[1]
}

function toRunError(error: unknown, apiError: ApiError | undefined, line: number): RunError {
  if (error instanceof ApiError) return { code: error.code, params: error.params, range: lineRange(line) }
  if (apiError) return { code: apiError.code, params: apiError.params, range: lineRange(line) }
  if (error instanceof RangeError && /call stack/i.test(error.message)) return { code: 'stack_overflow', params: { name: '' }, range: lineRange(line) }
  const text = String((error as Error)?.message ?? error)
  return { code: 'java_runtime', params: { message: text }, range: lineRange(line) }
}

export async function loadFromOrigin(): Promise<JavaToolchain> {
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
