import { existsSync, readFileSync } from 'node:fs'
import { loadPyodide } from 'pyodide'
import { describe, expect, it } from 'vitest'
import { createChecker } from '../src/check'

// Prüfen ohne Ausführen – mit denselben Laufzeiten wie die Sprach-Tests (in Node)
const teavm = new URL('../teavm/', import.meta.url)
const dotnet = new URL('../dotnet/', import.meta.url)
const checker = createChecker({
  python: () => loadPyodide(),
  java: async () => {
    const { load } = await import(new URL('compiler.wasm-runtime.js', teavm).href)
    const bin = (name: string) => new Int8Array(readFileSync(new URL(name, teavm)))
    return { load, compiler: readFileSync(new URL('compiler.wasm', teavm)), sdk: bin('compile-classlib-teavm.bin'), classlib: bin('runtime-classlib-teavm.bin') }
  },
  csharp: () => import(new URL('dotnet.js', dotnet).href).then(m => m.dotnet.create()),
})

describe('Prüfen im Editor', { timeout: 120_000 }, () => {
  it('Python: Syntaxfehler mit Position, gültiger Code ohne Fehler', async () => {
    expect(await checker.check('python', 'k = Klonk()\nk.step()\n')).toEqual([])
    const [error] = await checker.check('python', 'x = 1\nif x\n  x = 2\n')
    expect(error).toMatchObject({ severity: 'error', line: 2 })
    expect(error!.message).toContain('SyntaxError')
  })

  it('Java: Compilerfehler mit Zeile und Spalte (Import in Zeile 1 herausgerechnet)', async () => {
    const ok = 'public class Main {\n  public static void main(String[] a) {\n    new Klonk().step();\n  }\n}'
    expect(await checker.check('java', ok)).toEqual([])
    const diagnostics = await checker.check('java', 'public class Main {\n  public static void main(String[] a) {\n    int x = "s";\n    new Klonk().stepp();\n  }\n}')
    expect(diagnostics.map(d => [d.line, d.column])).toEqual([[3, 13], [4, 5]])
    expect(diagnostics[1]!.message).toContain('stepp')
    // Fehler in Zeile 1 (dort steht der unsichtbare Import)
    expect((await checker.check('java', 'public class Main { int x = "s"; }'))[0]).toMatchObject({ line: 1, column: 29 })
  })

  it.skipIf(!existsSync(new URL('dotnet.js', dotnet)))('C#: Fehler und Warnungen der Nutzerdatei', async () => {
    expect(await checker.check('csharp', 'var k = new Klonk();\nk.Step();\n')).toEqual([])
    const diagnostics = await checker.check('csharp', 'var k = new Klonk();\nk.Stepp();\nint unused;\n')
    expect(diagnostics[0]).toMatchObject({ severity: 'error', line: 2, column: 3 })
    expect(diagnostics[0]!.message).toContain('Stepp')
    expect(diagnostics.some(d => d.severity === 'warning' && d.line === 3)).toBe(true)
  })
})
