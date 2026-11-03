import type { RobotCommand, SourceRange, Value } from '@klonk/klonk-script'
import { assetUrl } from '../assets'
import { World } from '@klonk/world'
import type { FromWorker, RunError, ToWorker } from '../protocol'
import type { ApiError } from '../js/api'
import { ROBOT_METHODS, createApi } from '../js/api'
import { CONTROL, views } from '../js/shared'
import { createDbCall } from '../db/channel'

/** Wo der C#-Host liegt (Roslyn auf .NET-WebAssembly, `node scripts/build-csharp.ts`; eigene Origin wegen COEP) */
export const DOTNET_URL = assetUrl('dotnet')

/** Zugriffe, die Nutzercode nicht braucht */
const BLOCKED_GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'WebTransport', 'postMessage', 'onmessage', 'close']

type HostResult = { ok?: boolean, error?: string, message?: string, line?: number, name?: string }
export type DotnetHost = {
  setModuleImports(module: string, imports: Record<string, unknown>): void
  getAssemblyExports(assembly: string): Promise<{ Host: { Run(source: string, files: string[]): string, Check(source: string, files: string[]): string, Complete(source: string, files: string[], position: number): string, Hover(source: string, files: string[], position: number): string } }>
}

/**
 * C# im Worker: Der .NET-Host (packages/csharp) kompiliert mit Roslyn, setzt Prüfpunkte und führt aus.
 * Roboterbefehle, Prüfpunkte und Ausgaben kommen per JSImport synchron hierher; Steuerung über SharedArrayBuffer.
 */
export async function runCSharp(
  message: Extract<ToWorker, { type: 'run' }>,
  post: (message: FromWorker) => void,
  createHost: () => Promise<DotnetHost> = loadFromOrigin,
) {
  if (!message.shared) {
    post({ type: 'error', error: { code: 'isolation_required', params: {} } })
    return
  }
  const { control, breakpoints } = views(message.shared)

  let host: DotnetHost
  try {
    host = await createHost()
  }
  catch (error) {
    post({ type: 'error', error: { code: 'cs_load', params: { message: String((error as Error)?.message ?? error) } } })
    return
  }

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
  // Argumente kodiert: "n:1.5" (Zahl) oder "s:text"; Ergebnis als Text
  const decode = (a: string) => (a.startsWith('n:') ? Number(a.slice(2)) : a.slice(2))
  const methods = new Set<string>(ROBOT_METHODS)

  bindImports(host, {
    call: (name: string, args: string[]) => {
      const values = args.map(decode)
      let result: unknown
      if (name === '$robot') result = api.robot(values[0]).name
      else if (name === '$names') result = api.names().join('\n')
      else if (name === '$db') result = api.db.json(String(values[0]))
      else if (name === '$create') result = api.create(values[0], values[1] || undefined, values[2], values[3]).name
      else if (methods.has(name)) result = api.robot(values[0])[name]!(...values.slice(1))
      else if (typeof api.globals[name] === 'function') result = (api.globals[name] as (...a: unknown[]) => unknown)(...values)
      else throw new Error(`unknown command ${name}`)
      return result === undefined ? '' : String(result)
    },
    checkpoint: (current: number) => {
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
    },
    variable: (name: string, value: string) => {
      variables[name] = value
    },
    pause: () => {
      Atomics.store(control, CONTROL.PAUSE, 0)
      Atomics.store(control, CONTROL.SIGNAL, 0)
      post({ type: 'paused', range: lineRange(line), variables, reason: pauseReason })
      Atomics.wait(control, CONTROL.SIGNAL, 0)
      stepping = Atomics.load(control, CONTROL.SIGNAL) === 2
      post({ type: 'resumed' })
    },
    print: (text: string) => post({ type: 'output', text }),
  })

  try {
    const exports = await host.getAssemblyExports('Klonk.CSharp')
    // Sandbox erst nach dem Laden (die Laufzeit lädt ihre Dateien per fetch)
    const scope = globalThis as unknown as Record<string, unknown>
    for (const name of BLOCKED_GLOBALS) {
      try {
        Object.defineProperty(scope, name, { value: undefined, configurable: true, writable: true })
      }
      catch {
        // nicht überschreibbar – egal
      }
    }
    // Weitere .cs-Dateien des Projekts nur mit Lizenz (Bibliotheken)
    const libraries = message.allowImports ? Object.entries(message.files).filter(([path, source]) => path.endsWith('.cs') && source !== message.source).map(([, source]) => source) : []
    const result = JSON.parse(exports.Host.Run(message.source, libraries)) as HostResult
    if (result.ok) post({ type: 'done' })
    else post({ type: 'error', error: toRunError(result, apiError, line, message) })
  }
  catch (error) {
    post({ type: 'error', error: apiError
      ? { code: apiError.code, params: apiError.params, range: lineRange(line) }
      : { code: 'cs_runtime', params: { name: 'Error', message: String((error as Error)?.message ?? error) }, range: lineRange(line) } })
  }
}

/** Bezieht sich ein Compilerfehler auf Namensräume/Klassen anderer Projektdateien (ohne Lizenz nicht dabei)? */
function usesProjectCSharp(error: string, message: Extract<ToWorker, { type: 'run' }>) {
  const names = new Set<string>()
  for (const [path, source] of Object.entries(message.files)) {
    if (!path.endsWith('.cs') || source === message.source) continue
    for (const m of source.matchAll(/\bnamespace\s+([\w.]+)/g)) for (const part of m[1]!.split('.')) names.add(part)
    for (const m of source.matchAll(/\b(?:class|struct|record|interface|enum)\s+(\w+)/g)) names.add(m[1]!)
  }
  const name = /(?:type or namespace name|The name) '(\w+)'/.exec(error)?.[1]
  return !!name && names.has(name)
}

function toRunError(result: HostResult, apiError: ApiError | undefined, line: number, message?: Extract<ToWorker, { type: 'run' }>): RunError {
  switch (result.error) {
    case 'cs_compile':
      if (message && !message.allowImports && usesProjectCSharp(result.message ?? '', message)) return { code: 'feature_libraries', params: {}, range: result.line ? lineRange(result.line) : undefined }
      return { code: 'cs_compile', params: { message: result.message ?? '' }, range: result.line ? lineRange(result.line) : undefined }
    case 'cs_no_main':
      return { code: 'cs_no_main', params: {} }
    case 'js':
      if (apiError) return { code: apiError.code, params: apiError.params, range: lineRange(line) }
      return { code: 'cs_runtime', params: { name: 'Error', message: result.message ?? '' }, range: lineRange(line) }
    default:
      return { code: 'cs_runtime', params: { name: result.name ?? 'Exception', message: result.message ?? '' }, range: lineRange(line) }
  }
}

type Imports = Record<string, (...args: never[]) => unknown>
const bound = new WeakMap<DotnetHost, { current: Imports }>()

/** .NET bindet JS-Importe beim ersten Aufruf fest ⇒ einmal Weiterleitungen registrieren, Ziel je Lauf tauschen */
function bindImports(host: DotnetHost, imports: Imports) {
  let entry = bound.get(host)
  if (!entry) {
    const created = { current: imports }
    entry = created
    bound.set(host, created)
    host.setModuleImports('klonk', Object.fromEntries(Object.keys(imports).map(name =>
      [name, (...args: never[]) => created.current[name]!(...args)])))
  }
  entry.current = imports
}

export async function loadFromOrigin(): Promise<DotnetHost> {
  // dotnet.js hält einen Worker mit `importScripts` für einen von .NET selbst gestarteten Worker und wartet dann
  // vergeblich auf Daten vom Hauptthread. In Modul-Workern ist importScripts ohnehin unbenutzbar ⇒ ausblenden
  // und die Laufzeit wie im Browserfenster starten lassen.
  const scope = globalThis as unknown as Record<string, unknown>
  Object.defineProperty(scope, 'importScripts', { value: undefined, configurable: true, writable: true })
  scope.window ??= globalThis
  const { dotnet } = await import(/* @vite-ignore */ `${DOTNET_URL}dotnet.js`) as { dotnet: { create(): Promise<DotnetHost> } }
  return dotnet.create()
}

function lineRange(line: number): SourceRange {
  return { line, column: 1, endLine: line, endColumn: 1 }
}
