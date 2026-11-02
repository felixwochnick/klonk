import type { PyodideInterface } from 'pyodide'
import { loadFromOrigin as loadDotnet, type DotnetHost } from './csharp/run'
import { friendlyJavacMessage, loadFromOrigin as loadJava, publicClass, type Compiler, type Diagnostic as JavacDiagnostic, type JavaToolchain } from './java/run'
import { createJavaService, type CompletionItem, type HoverInfo } from './java/complete'
import { JAVA_LIBRARY } from './java/lib'
import { DEBUG_JAVA, ROBOT_JAVA } from './java/robot'
import { loadFromOrigin as loadPython } from './python/run'
import { pythonStub } from './python/stub'
import type { ScriptLanguage } from '@klonk/klonk-script'

export type { CompletionItem, HoverInfo } from './java/complete'

/**
 * Sprachdienst ohne Ausführen (für den Editor): Syntax-/Compilerfehler, Vorschläge und Erklärungen für Python
 * (Pyodide + Jedi), Java (javac + eigene Textanalyse) und C# (Roslyn). JS/TS übernimmt der TypeScript-Worker von
 * Monaco, Klonk-Script der eigene Parser im Hauptthread.
 */
export type CheckLanguage = 'python' | 'java' | 'csharp'

export type CheckDiagnostic = {
  severity: 'error' | 'warning'
  message: string
  line: number
  column: number
  endLine: number
  endColumn: number
}

/** Anfrage an den Sprachdienst; Positionen 1-basiert (Zeile/Spalte) bzw. 0-basiert (`offset`) */
export type ToChecker = {
  id: number
  type: 'check' | 'complete' | 'hover'
  language: CheckLanguage
  source: string
  files: Record<string, string>
  /** Pfad der Datei im Projekt (Importe relativ dazu) */
  path?: string
  offset?: number
  line?: number
  column?: number
  /** Sprache der Erklärungen */
  lang?: ScriptLanguage
}
export type FromChecker
  = | { id: number, diagnostics: CheckDiagnostic[] }
    | { id: number, items: CompletionItem[] }
    | { id: number, hover: HoverInfo | null }
    | { id: number, unavailable: true }

export type CheckLoaders = {
  python: () => Promise<PyodideInterface>
  /** Jedi + Parso als Wheels (packages/runtime/pylibs) */
  pythonLibs: () => Promise<ArrayBuffer[]>
  java: () => Promise<JavaToolchain>
  csharp: () => Promise<DotnetHost>
}

/** Wo die Python-Bibliotheken für den Editor liegen (eigene Origin wegen COEP; siehe apps/app/nuxt.config.ts) */
export const PYLIBS_URL = '/pylibs/'
export const PYLIBS = ['jedi-0.20.1-py2.py3-none-any.whl', 'parso-0.8.7-py2.py3-none-any.whl']

const ORIGIN_LOADERS: CheckLoaders = {
  python: loadPython,
  pythonLibs: () => Promise.all(PYLIBS.map(async (name) => {
    const response = await fetch(`${PYLIBS_URL}${name}`)
    if (!response.ok) throw new Error(`${name}: ${response.status}`)
    return response.arrayBuffer()
  })),
  java: loadJava,
  csharp: loadDotnet,
}

/** Prüfer mit einmal geladenen Laufzeiten (Pyodide, javac, Roslyn) */
export function createChecker(loaders: CheckLoaders = ORIGIN_LOADERS) {
  const cache = new Map<string, Promise<unknown>>()
  const once = <T>(language: string, create: () => Promise<T>): Promise<T> => {
    if (!cache.has(language)) {
      cache.set(language, create().catch((error) => {
        // Beim nächsten Mal neu versuchen (z. B. wieder online)
        cache.delete(language)
        throw error
      }))
    }
    return cache.get(language) as Promise<T>
  }

  /** Ein Pyodide für Syntaxprüfung und Jedi */
  const pyodide = () => once('python', () => loaders.python())

  async function python(source: string): Promise<CheckDiagnostic[]> {
    type Result = { toJs: () => [number, number, number, number, string], destroy: () => void } | undefined
    const py = await pyodide()
    const check = await once('pycheck', async () => {
      py.runPython(String.raw`
def _klonk_check(source):
    try:
        compile(source, '<klonk>', 'exec')
        return None
    except SyntaxError as e:
        line = e.lineno or 1
        column = e.offset or 1
        end_line = e.end_lineno or line
        end_column = e.end_offset if e.end_offset and (end_line > line or e.end_offset > column) else column + 1
        return [line, column, end_line, end_column, type(e).__name__ + ': ' + str(e.msg)]
`)
      return py.globals.get('_klonk_check') as (source: string) => Result
    })
    const result = check(source)
    if (!result) return []
    const [line, column, endLine, endColumn, message] = result.toJs()
    result.destroy()
    return [{ severity: 'error', message, line, column, endLine, endColumn }]
  }

  async function java(source: string, files: Record<string, string>): Promise<CheckDiagnostic[]> {
    const compiler = await once('java', async () => {
      const tools = await loaders.java()
      const c = (await tools.load(tools.compiler)).exports.createCompiler!() as Compiler
      c.setSdk(tools.sdk)
      c.setTeaVMClasslib(tools.classlib)
      c.addSourceFile('Klonk.java', ROBOT_JAVA)
      c.addSourceFile('Debug.java', DEBUG_JAVA)
      for (const [name, source] of Object.entries(JAVA_LIBRARY)) c.addSourceFile(name, source)
      return { compiler: c, added: new Set<string>(), diagnostics: [] as JavacDiagnostic[], listening: false }
    })
    const c = compiler.compiler
    if (!compiler.listening) {
      c.onDiagnostic((d) => {
        const read = <T>(fn: () => T, fallback: T) => {
          try {
            return fn() ?? fallback
          }
          catch {
            return fallback
          }
        }
        compiler.diagnostics.push({
          type: read(() => d.type, ''), severity: read(() => d.severity, ''), fileName: read(() => d.fileName, ''),
          lineNumber: read(() => d.lineNumber, 0), columnNumber: read(() => d.columnNumber, 0),
          startPosition: read(() => d.startPosition, -1), endPosition: read(() => d.endPosition, -1), message: read(() => d.message, ''),
        })
      })
      compiler.listening = true
    }
    // Dateien wie beim Ausführen (Dateiname nach der öffentlichen Klasse), aber ohne Prüfpunkte
    const main = `${publicClass(source) ?? 'Main'}.java`
    const current: Record<string, string> = { [main]: source }
    for (const [path, text] of Object.entries(files)) {
      const name = `${publicClass(text) ?? path.slice(path.lastIndexOf('/') + 1, -5)}.java`
      if (path.endsWith('.java') && name !== main) current[name] = text
    }
    // Nicht mehr vorhandene Dateien leeren (der Compiler kennt kein Entfernen)
    for (const name of compiler.added) if (!(name in current)) c.addSourceFile(name, '')
    for (const [name, text] of Object.entries(current)) {
      c.addSourceFile(name, text)
      compiler.added.add(name)
    }
    compiler.diagnostics.length = 0
    c.compile()

    const lineStarts = [0]
    for (let i = 0; i < source.length; i++) if (source[i] === '\n') lineStarts.push(i + 1)
    const toPosition = (offset: number) => {
      const o = Math.max(0, offset)
      let line = 0
      while (line + 1 < lineStarts.length && lineStarts[line + 1]! <= o) line++
      return { line: line + 1, column: o - lineStarts[line]! + 1 }
    }
    return compiler.diagnostics
      .filter(d => d.fileName.endsWith(main) && (d.severity === 'error' || d.severity === 'warning'))
      .slice(0, 100)
      .map((d) => {
        const start = d.startPosition !== undefined && d.startPosition >= 0 ? toPosition(d.startPosition) : { line: d.lineNumber || 1, column: 1 }
        const end = d.endPosition !== undefined && d.endPosition > (d.startPosition ?? -1) ? toPosition(d.endPosition) : { line: start.line, column: start.column + 1 }
        return { severity: d.severity === 'error' ? 'error' : 'warning', message: friendlyJavacMessage(d.message), line: start.line, column: start.column, endLine: end.line, endColumn: end.column }
      })
  }

  async function csharp(source: string, files: Record<string, string>): Promise<CheckDiagnostic[]> {
    const exports = await once('csharp', async () => (await loaders.csharp()).getAssemblyExports('Klonk.CSharp'))
    const libraries = Object.entries(files).filter(([path, text]) => path.endsWith('.cs') && text !== source).map(([, text]) => text)
    return JSON.parse(exports.Host.Check(source, libraries)) as CheckDiagnostic[]
  }

  // --- Vorschläge und Erklärungen -------------------------------------------

  const javaServices = new Map<ScriptLanguage, ReturnType<typeof createJavaService>>()
  const javaService = (lang: ScriptLanguage) => {
    if (!javaServices.has(lang)) javaServices.set(lang, createJavaService(lang))
    return javaServices.get(lang)!
  }

  const csharpExports = () => once('csharp', async () => (await loaders.csharp()).getAssemblyExports('Klonk.CSharp'))
  const csharpLibraries = (source: string, files: Record<string, string>) =>
    Object.entries(files).filter(([path, text]) => path.endsWith('.cs') && text !== source).map(([, text]) => text)

  /** Jedi im Pyodide des Prüfers: Stub für `klonk`, Projektdateien unter /klonk/project */
  type PyCall = (...args: unknown[]) => { toJs: (o?: object) => unknown, destroy: () => void } | undefined | null
  let stubLang: ScriptLanguage | undefined
  let projectFiles = new Set<string>()
  async function jedi(request: ToChecker) {
    const py = await pyodide()
    await once('jedi', async () => {
      for (const wheel of await loaders.pythonLibs()) py.unpackArchive(wheel, 'wheel')
      py.FS.mkdirTree('/klonk/stubs')
      py.FS.mkdirTree('/klonk/project')
      py.runPython(JEDI_SERVICE)
    })
    const lang = request.lang ?? 'de'
    if (stubLang !== lang) {
      py.FS.writeFile('/klonk/stubs/klonk.py', pythonStub(lang))
      stubLang = lang
      py.runPython('_klonk_jedi_reset()')
    }
    // Projektdateien spiegeln (für Importe zwischen Dateien)
    const next = new Set(Object.keys(request.files).filter(p => p.endsWith('.py') && p !== request.path))
    for (const path of projectFiles) if (!next.has(path)) py.FS.unlink(`/klonk/project/${path}`)
    for (const path of next) {
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
      if (dir) py.FS.mkdirTree(`/klonk/project/${dir}`)
      py.FS.writeFile(`/klonk/project/${path}`, request.files[path]!)
    }
    projectFiles = next
    return py
  }

  async function complete(request: ToChecker): Promise<CompletionItem[]> {
    const { language, source, files, offset = 0 } = request
    if (language === 'java') return javaService(request.lang ?? 'de').complete(source, offset, files)
    if (language === 'csharp') {
      const raw = JSON.parse((await csharpExports()).Host.Complete(source, csharpLibraries(source, files), offset)) as (CompletionItem & { container?: string })[]
      return raw
    }
    const py = await jedi(request)
    const result = (py.globals.get('_klonk_complete') as PyCall)(source, request.path ?? 'main.py', request.line ?? 1, (request.column ?? 1) - 1)
    const items = result?.toJs({ dict_converter: Object.fromEntries }) as CompletionItem[]
    result?.destroy()
    return items
  }

  async function hover(request: ToChecker): Promise<HoverInfo | null> {
    const { language, source, files, offset = 0 } = request
    if (language === 'java') return javaService(request.lang ?? 'de').hover(source, offset, files)
    if (language === 'csharp') return JSON.parse((await csharpExports()).Host.Hover(source, csharpLibraries(source, files), offset)) as HoverInfo | null
    const py = await jedi(request)
    const result = (py.globals.get('_klonk_hover') as PyCall)(source, request.path ?? 'main.py', request.line ?? 1, (request.column ?? 1) - 1)
    const info = result?.toJs({ dict_converter: Object.fromEntries }) as HoverInfo | undefined
    result?.destroy()
    return info ?? null
  }

  return {
    check(language: CheckLanguage, source: string, files: Record<string, string> = {}) {
      if (language === 'python') return python(source)
      if (language === 'java') return java(source, files)
      return csharp(source, files)
    },
    complete,
    hover,
  }
}

/** Jedi-Anbindung (läuft im Pyodide des Prüfers, nie im Ausführungs-Worker) */
const JEDI_SERVICE = String.raw`
import jedi
from jedi.api.environment import InterpreterEnvironment

_klonk_env = InterpreterEnvironment()
_klonk_project = None

def _klonk_jedi_reset():
    global _klonk_project
    jedi.cache.clear_time_caches(True)
    _klonk_project = jedi.Project('/klonk/project', added_sys_path=['/klonk/stubs'], smart_sys_path=False)

_KLONK_KINDS = {'function': 'method', 'class': 'class', 'instance': 'variable', 'module': 'module', 'keyword': 'keyword',
                'statement': 'variable', 'param': 'variable', 'property': 'property', 'path': 'module'}

def _klonk_script(source, path):
    import os
    main_dir = os.path.dirname('/klonk/project/' + path)
    project = jedi.Project('/klonk/project', added_sys_path=['/klonk/stubs', main_dir], smart_sys_path=False)
    return jedi.Script(source, path='/klonk/project/' + path, project=project, environment=_klonk_env)

def _klonk_complete(source, path, line, column):
    result = []
    for i, c in enumerate(_klonk_script(source, path).complete(line, column)):
        if c.name.startswith('__') or i >= 150:
            continue
        item = {'label': c.name, 'kind': _KLONK_KINDS.get(c.type, 'text'), 'detail': c.description}
        # Erklärungen sind teuer – nur für die ersten Vorschläge
        if i < 40:
            try:
                doc = c.docstring(raw=True)
                if doc:
                    item['documentation'] = doc
            except Exception:
                pass
        result.append(item)
    return result

def _klonk_hover(source, path, line, column):
    names = _klonk_script(source, path).help(line, column)
    if not names:
        return None
    n = names[0]
    signatures = [s.to_string() for s in n.get_signatures()] if n.type in ('function', 'class') else []
    detail = signatures[0] if signatures else n.description
    result = {'detail': detail}
    doc = n.docstring(raw=True)
    if doc:
        result['documentation'] = doc
    return result

_klonk_jedi_reset()
`
