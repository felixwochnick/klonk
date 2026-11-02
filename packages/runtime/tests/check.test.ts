import { existsSync, readFileSync } from 'node:fs'
import { loadPyodide } from 'pyodide'
import { describe, expect, it } from 'vitest'
import { PYLIBS, createChecker } from '../src/check'

// Prüfen ohne Ausführen – mit denselben Laufzeiten wie die Sprach-Tests (in Node)
const teavm = new URL('../teavm/', import.meta.url)
const dotnet = new URL('../dotnet/', import.meta.url)
const checker = createChecker({
  python: () => loadPyodide(),
  pythonLibs: async () => PYLIBS.map(name => new Uint8Array(readFileSync(new URL(`../pylibs/${name}`, import.meta.url))).buffer),
  java: async () => {
    const { load } = await import(new URL('compiler.wasm-runtime.js', teavm).href)
    const bin = (name: string) => new Int8Array(readFileSync(new URL(name, teavm)))
    return { load, compiler: readFileSync(new URL('compiler.wasm', teavm)), sdk: bin('compile-classlib-teavm.bin'), classlib: bin('runtime-classlib-teavm.bin') }
  },
  csharp: () => import(new URL('dotnet.js', dotnet).href).then(m => m.dotnet.create()),
})

describe('Prüfen im Editor', { timeout: 120_000 }, () => {
  it('Python: Syntaxfehler mit Position, gültiger Code ohne Fehler', async () => {
    expect(await checker.check('python', 'from klonk import Klonk\nk = Klonk()\nk.step()\n')).toEqual([])
    const [error] = await checker.check('python', 'x = 1\nif x\n  x = 2\n')
    expect(error).toMatchObject({ severity: 'error', line: 2 })
    expect(error!.message).toContain('SyntaxError')
  })

  it('Java: Compilerfehler mit Zeile und Spalte', async () => {
    const ok = 'import klonk.Klonk;\npublic class Main {\n  public static void main(String[] a) {\n    new Klonk().step();\n  }\n}'
    expect(await checker.check('java', ok)).toEqual([])
    const diagnostics = await checker.check('java', 'import klonk.Klonk; public class Main {\n  public static void main(String[] a) {\n    int x = "s";\n    new Klonk().stepp();\n  }\n}')
    expect(diagnostics.map(d => [d.line, d.column])).toEqual([[3, 13], [4, 5]])
    expect(diagnostics[1]!.message).toContain('stepp')
    // Fehler in Zeile 1 (dort steht der unsichtbare Import)
    expect((await checker.check('java', 'public class Main { int x = "s"; }'))[0]).toMatchObject({ line: 1, column: 29 })
    // Import vergessen ⇒ verständliche Meldung
    const missing = await checker.check('java', 'public class Main { Klonk k = new Klonk(); }')
    expect(missing[0]!.message).toContain('missing import klonk.Klonk')
  })

  it.skipIf(!existsSync(new URL('dotnet.js', dotnet)))('C#: Fehler und Warnungen der Nutzerdatei', async () => {
    expect(await checker.check('csharp', 'using klonk;\nvar k = new Klonk();\nk.Step();\n')).toEqual([])
    const diagnostics = await checker.check('csharp', 'using klonk; var k = new Klonk();\nk.Stepp();\nint unused;\n')
    expect(diagnostics[0]).toMatchObject({ severity: 'error', line: 2, column: 3 })
    expect(diagnostics[0]!.message).toContain('Stepp')
    expect(diagnostics.some(d => d.severity === 'warning' && d.line === 3)).toBe(true)
  })

  it.skipIf(!existsSync(new URL('dotnet.js', dotnet)))('C#: Vorschläge (Mitglieder, Variablen, Projektklassen) und Erklärungen', async () => {
    const at = (code: string) => ({ source: code.replace('|', ''), offset: code.indexOf('|') })
    const request = (code: string, files: Record<string, string> = {}) => ({ id: 1, type: 'complete' as const, language: 'csharp' as const, files, ...at(code) })
    const labels = async (code: string, files: Record<string, string> = {}) => (await checker.complete(request(code, files))).map(i => i.label)
    expect(await labels('using klonk;\nvar karl = new Klonk("Karl");\nkarl.|')).toEqual(expect.arrayContaining(['Step', 'IsWall', 'Name']))
    expect(await labels('using klonk;\nvar anzahl = 3;\nvar k = new Klonk();\n|')).toEqual(expect.arrayContaining(['anzahl', 'k', 'Klonk', 'Console', 'foreach']))
    const files = { 'Tools.cs': 'namespace Tools;\npublic static class Walker {\n  /// <summary>Zwei Schritte</summary>\n  public static void Two(klonk.Klonk k) {}\n}' }
    const items = await checker.complete(request('Tools.Walker.|', files))
    expect(items.find(i => i.label === 'Two')).toMatchObject({ kind: 'method', documentation: 'Zwei Schritte' })
    const hover = at('using klonk;\nvar k = new Klonk();\nk.St|ep();')
    expect(await checker.hover({ id: 2, type: 'hover', language: 'csharp', files: {}, ...hover })).toMatchObject({ detail: expect.stringContaining('Step(') })
  })

  it('Java: Vorschläge über den Dienst', async () => {
    const source = 'import klonk.Klonk;\npublic class Main { void f() { Klonk k = new Klonk(); k. } }'
    const items = await checker.complete({ id: 1, type: 'complete', language: 'java', source, files: {}, offset: source.indexOf('k. ') + 2, lang: 'en' })
    expect(items.find(i => i.label === 'step')?.documentation).toContain('forward')
  })

  it('Python: Vorschläge mit Jedi (klonk, Variablen, Projektmodule) und Erklärungen', async () => {
    const files = { 'tools/helfer.py': 'def zwei(robot):\n    """Zwei Schritte"""\n    pass\n' }
    const complete = async (source: string, line: number, column: number) =>
      (await checker.complete({ id: 1, type: 'complete', language: 'python', source, files, path: 'main.py', line, column, lang: 'de' })).map(i => i.label)
    expect(await complete('from klonk import Klonk\nk = Klonk()\nk.', 3, 3)).toEqual(expect.arrayContaining(['step', 'is_wall', 'turn_left', 'name']))
    expect(await complete('anzahl = 3\nanz', 2, 4)).toContain('anzahl')
    expect(await complete('from tools import helfer\nhelfer.', 2, 8)).toContain('zwei')
    const hover = await checker.hover({ id: 2, type: 'hover', language: 'python', source: 'from klonk import Klonk\nk = Klonk()\nk.step()', files, path: 'main.py', line: 3, column: 4, lang: 'de' })
    expect(hover?.documentation).toContain('vorwärts')
  })
})
