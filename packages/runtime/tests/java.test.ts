import { readFileSync } from 'node:fs'
import type { WorldData } from '@klonk/world'
import { BUILTINS } from '@klonk/klonk-script'
import { beforeEach, describe, expect, it } from 'vitest'
import type { FromWorker, ToWorker } from '../src/protocol'
import { instrumentJava } from '../src/java/instrument'
import { ROBOT_JAVA } from '../src/java/robot'
import { runJava } from '../src/java/run'
import { createSharedState } from '../src/js/shared'

describe('Java: Instrumentierung', () => {
  it('Prüfpunkt vor jeder Anweisung, Zeilen bleiben gleich, Variablen im Sichtbereich', () => {
    const source = `public class Main {
  static int twice(int x) {
    int y = x * 2;
    return y;
  }
  public static void main(String[] args) {
    int total = 0;
    for (int i = 0; i < 3; i++) total += twice(i);
    if (total > 2) step(); else { turnLeft(); }
    while (!isWall());
  }
}`
    const out = instrumentJava(source)!
    expect(out.split('\n')).toHaveLength(source.split('\n').length)
    const lines = out.split('\n')
    expect(lines[2]).toContain('if (klonk.Robot.__cp(3)) { klonk.Robot.__v("x", x); klonk.Robot.__pause(); } int y')
    expect(lines[3]).toContain('klonk.Robot.__v("x", x); klonk.Robot.__v("y", y);')
    // Schleifenrumpf ohne Klammern wird geklammert, Schleifenvariable sichtbar
    expect(lines[7]).toMatch(/i\+\+\) \{ if \(klonk\.Robot\.__cp\(8\)\) \{ .*__v\("i", i\).* total \+= twice\(i\); \}/)
    expect(lines[8]).toMatch(/if \(total > 2\) \{ if \(klonk\.Robot\.__cp\(9\)\).* step\(\); \} else \{/)
    // Leere Schleife: Prüfpunkt je Durchlauf
    expect(lines[9]).toMatch(/while \(!isWall\(\)\)\{ if \(klonk\.Robot\.__cp\(10\)\).*; \}/)
    // Parameter von main, aber nicht von twice
    expect(lines[6]).toContain('__v("args", args)')
    expect(lines[6]).not.toContain('"x"')
  })

  it('Lambdas sehen keine äußeren Variablen, Syntaxfehler ⇒ null', () => {
    const out = instrumentJava('class A { void f() { int a = 1; Runnable r = () -> { int b = 2; g(b); }; } }')!
    expect(out).toContain('__v("b", b)')
    expect(out.match(/__v\("a", a\)/g)).toHaveLength(1)
    expect(instrumentJava('class A { void f() { int = ; } }')).toBeNull()
  })

  it('Robot.java enthält die englische Roboter-API', () => {
    for (const [name, builtin] of Object.entries(BUILTINS)) {
      if (builtin.kind === 'constant') expect(ROBOT_JAVA).toContain(`String ${name.toUpperCase()} =`)
      else if (name === 'wait') expect(ROBOT_JAVA).toContain('static void sleep(double seconds)')
      else expect(ROBOT_JAVA).toMatch(new RegExp(`public static \\w+ ${name}\\(`))
    }
  })
})

// Echter Compiler (teavm-javac, WebAssembly) in Node
const dir = new URL('../teavm/', import.meta.url)
const toolchain = async () => {
  const { load } = await import(new URL('compiler.wasm-runtime.js', dir).href)
  const bin = (name: string) => new Int8Array(readFileSync(new URL(name, dir)))
  return { load, compiler: readFileSync(new URL('compiler.wasm', dir)), sdk: bin('compile-classlib-teavm.bin'), classlib: bin('runtime-classlib-teavm.bin') }
}
const world: WorldData = {
  version: 1,
  size: { width: 5, depth: 5, height: 3 },
  cells: [],
  characters: [{ id: 'k', model: 'male', x: 0, z: 0, direction: 'east' }],
}
const messages: FromWorker[] = []
const run = (source: string, extra: Partial<Extract<ToWorker, { type: 'run' }>> = {}) =>
  runJava({ type: 'run', language: 'java', source, world, breakpoints: [], delay: 0, allowImports: false, files: {}, shared: createSharedState(), ...extra }, m => messages.push(m), toolchain)

describe('Java: Ausführen', { timeout: 120_000 }, () => {
  beforeEach(() => {
    messages.length = 0
  })

  it('Roboter-API, Ausgabe, Ende', async () => {
    await run(`public class Main {
  public static void main(String[] args) {
    int n = 0;
    while (!isWall()) { step(); n++; }
    turnRight();
    placeBrick(BLUE);
    System.out.println("steps " + n);
    print("x", positionX(), isWall());
  }
}`)
    expect(messages.filter(m => m.type === 'command')).toHaveLength(6)
    expect(messages.filter(m => m.type === 'output')).toEqual([{ type: 'output', text: 'steps 4' }, { type: 'output', text: 'x 5 false' }])
    expect(messages.at(-1)).toEqual({ type: 'done' })
  })

  it('Compiler-, Welt- und Laufzeitfehler mit Zeile', async () => {
    await run('public class Main {\n  public static void main(String[] args) {\n    int x = "a";\n  }\n}')
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'java_compile', range: { line: 3 } } })
    messages.length = 0
    await run('public class Main {\n  public static void main(String[] args) {\n    turnLeft();\n    step();\n  }\n}')
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'world', params: { worldCode: 'wall' }, range: { line: 4 } } })
    messages.length = 0
    await run('public class Main {\n  public static void main(String[] args) {\n    int a = 0;\n    System.out.println(1 / a);\n  }\n}')
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'java_runtime', range: { line: 4 } } })
  })
})
