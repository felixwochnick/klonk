import type { RobotCommand, SourceRange, Value } from '@klonk/klonk-script'
import { World } from '@klonk/world'
import type { FromWorker, RunError, ToWorker } from '../protocol'
import { ApiError, createApi } from '../js/api'
import { CONTROL, views } from '../js/shared'

/** Wo der C#-Host liegt (Roslyn auf .NET-WebAssembly, `node scripts/build-csharp.ts`; eigene Origin wegen COEP) */
export const DOTNET_URL = '/dotnet/'

/** Zugriffe, die Nutzercode nicht braucht */
const BLOCKED_GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'WebTransport', 'postMessage', 'onmessage', 'close']

type HostResult = { ok?: boolean, error?: string, message?: string, line?: number, name?: string }
type DotnetHost = {
  setModuleImports(module: string, imports: Record<string, unknown>): void
  getAssemblyExports(assembly: string): Promise<{ Host: { Run(source: string, files: string[]): string } }>
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
    character: message.characterId ?? world.getCharacters()[0]?.id ?? '',
    command: (command: RobotCommand) => post({ type: 'command', command }),
    print: (text: string) => post({ type: 'output', text }),
    sleep,
  })

  bindImports(host, {
    // Argumente kodiert: "n:1.5" (Zahl) oder "s:text"; Ergebnis als Text
    call: (name: string, args: string[]) => {
      const fn = api[name] as ((...a: unknown[]) => unknown) | undefined
      if (typeof fn !== 'function') throw new Error(`unknown command ${name}`)
      try {
        const result = fn(...args.map(a => (a.startsWith('n:') ? Number(a.slice(2)) : a.slice(2))))
        return result === undefined ? '' : String(result)
      }
      catch (error) {
        if (error instanceof ApiError) apiError = error
        throw error
      }
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
    else post({ type: 'error', error: toRunError(result, apiError, line) })
  }
  catch (error) {
    post({ type: 'error', error: apiError
      ? { code: apiError.code, params: apiError.params, range: lineRange(line) }
      : { code: 'cs_runtime', params: { name: 'Error', message: String((error as Error)?.message ?? error) }, range: lineRange(line) } })
  }
}

function toRunError(result: HostResult, apiError: ApiError | undefined, line: number): RunError {
  switch (result.error) {
    case 'cs_compile':
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

async function loadFromOrigin(): Promise<DotnetHost> {
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
