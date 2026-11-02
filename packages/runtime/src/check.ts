import type { PyodideInterface } from 'pyodide'
import { loadFromOrigin as loadDotnet, type DotnetHost } from './csharp/run'
import { friendlyJavacMessage, loadFromOrigin as loadJava, publicClass, type Compiler, type Diagnostic as JavacDiagnostic, type JavaToolchain } from './java/run'
import { DEBUG_JAVA, ROBOT_JAVA } from './java/robot'
import { loadFromOrigin as loadPython } from './python/run'

/**
 * Prüfen ohne Ausführen (für den Editor): Syntax- und Compilerfehler für Python, Java und C#.
 * JS/TS prüft der TypeScript-Worker von Monaco, Klonk-Script der eigene Parser im Hauptthread.
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

export type ToChecker = { id: number, language: CheckLanguage, source: string, files: Record<string, string> }
export type FromChecker = { id: number, diagnostics: CheckDiagnostic[] } | { id: number, unavailable: true }

export type CheckLoaders = {
  python: () => Promise<PyodideInterface>
  java: () => Promise<JavaToolchain>
  csharp: () => Promise<DotnetHost>
}

const ORIGIN_LOADERS: CheckLoaders = { python: loadPython, java: loadJava, csharp: loadDotnet }

/** Prüfer mit einmal geladenen Laufzeiten (Pyodide, javac, Roslyn) */
export function createChecker(loaders: CheckLoaders = ORIGIN_LOADERS) {
  const cache = new Map<CheckLanguage, Promise<unknown>>()
  const once = <T>(language: CheckLanguage, create: () => Promise<T>): Promise<T> => {
    if (!cache.has(language)) {
      cache.set(language, create().catch((error) => {
        // Beim nächsten Mal neu versuchen (z. B. wieder online)
        cache.delete(language)
        throw error
      }))
    }
    return cache.get(language) as Promise<T>
  }

  async function python(source: string): Promise<CheckDiagnostic[]> {
    type Result = { toJs: () => [number, number, number, number, string], destroy: () => void } | undefined
    const check = await once('python', async () => {
      const py = await loaders.python()
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

  return {
    check(language: CheckLanguage, source: string, files: Record<string, string> = {}) {
      if (language === 'python') return python(source)
      if (language === 'java') return java(source, files)
      return csharp(source, files)
    },
  }
}
