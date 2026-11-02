import { readFileSync } from 'node:fs'
import type { WorldData } from '@klonk/world'
import { BUILTINS } from '@klonk/klonk-script'
import { beforeEach, describe, expect, it } from 'vitest'
import type { FromWorker, ToWorker } from '../src/protocol'
import { instrumentJava } from '../src/java/instrument'
import { DEBUG_JAVA, ROBOT_JAVA } from '../src/java/robot'
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
    if (total > 2) k.step(); else { k.turnLeft(); }
    while (!k.isWall());
  }
}`
    const out = instrumentJava(source)!
    expect(out.split('\n')).toHaveLength(source.split('\n').length)
    const lines = out.split('\n')
    expect(lines[2]).toContain('if (__cp(3)) { __v("x", x); __pause(); } int y')
    expect(lines[3]).toContain('__v("x", x); __v("y", y);')
    // Schleifenrumpf ohne Klammern wird geklammert, Schleifenvariable sichtbar
    expect(lines[7]).toMatch(/i\+\+\) \{ if \(__cp\(8\)\) \{ .*__v\("i", i\).* total \+= twice\(i\); \}/)
    expect(lines[8]).toMatch(/if \(total > 2\) \{ if \(__cp\(9\)\).* k\.step\(\); \} else \{/)
    // Leere Schleife: Prüfpunkt je Durchlauf
    expect(lines[9]).toMatch(/while \(!k\.isWall\(\)\)\{ if \(__cp\(10\)\).*; \}/)
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

  it('Klonk.java enthält die englische Roboter-API (Befehle/Sensoren als Methoden), Debug.java den Debugger', () => {
    expect(ROBOT_JAVA).not.toContain('__cp')
    expect(DEBUG_JAVA).toContain('public static boolean __cp(int line)')
    for (const [name, builtin] of Object.entries(BUILTINS)) {
      if (name === 'selectCharacter') expect(ROBOT_JAVA).not.toContain(name)
      else if (name === 'createCharacter') expect(ROBOT_JAVA).toContain('public static Klonk create(String name)')
      else if (builtin.kind === 'constant') expect(ROBOT_JAVA).toContain(`String ${name.toUpperCase()} =`)
      else if (name === 'wait') expect(ROBOT_JAVA).toContain('static void sleep(double seconds)')
      else if (builtin.kind === 'function') expect(ROBOT_JAVA).toMatch(new RegExp(`public static \\w+ ${name}\\(`))
      else expect(ROBOT_JAVA).toMatch(new RegExp(`public (?!static)\\w+ ${name}\\(`))
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
// Roboter-API in Zeile 1 importieren (Zeilennummern bleiben gleich)
const IMPORT = 'import klonk.Klonk; import static klonk.Klonk.*; '
const run = (source: string, extra: Partial<Extract<ToWorker, { type: 'run' }>> = {}, prefix = IMPORT) =>
  runJava({ type: 'run', language: 'java', source: prefix + source, world, breakpoints: [], delay: 0, allowImports: false, files: {}, shared: createSharedState(), ...extra }, m => messages.push(m), toolchain)

describe('Java: Ausführen', { timeout: 120_000 }, () => {
  beforeEach(() => {
    messages.length = 0
  })

  it('Roboter-API als Objekt, Ausgabe, Ende', async () => {
    await run(`public class Main {
  public static void main(String[] args) {
    Klonk klonk = new Klonk();
    int n = 0;
    while (!klonk.isWall()) { klonk.step(); n++; }
    klonk.turnRight();
    klonk.placeBrick(BLUE);
    System.out.println("steps " + n);
    print("x", klonk.positionX(), klonk.isWall(), klonk);
  }
}`)
    expect(messages.filter(m => m.type === 'command')).toHaveLength(6)
    expect(messages.filter(m => m.type === 'output')).toEqual([{ type: 'output', text: 'steps 4' }, { type: 'output', text: 'x 5 false Klonk("k")' }])
    expect(messages.at(-1)).toEqual({ type: 'done' })
  })

  it('mehrere Figuren: Name, Nummer, alle', async () => {
    const two: WorldData = { ...world, characters: [...world.characters, { id: 'Klara', model: 'female', x: 0, z: 2, direction: 'east' }] }
    await run(`public class Main {
  public static void main(String[] args) {
    Klonk klara = new Klonk("klara");
    klara.step(2);
    new Klonk(1).step();
    for (Klonk r : Klonk.all()) print(r.name, r.positionX());
  }
}`, { world: two })
    expect(messages.filter(m => m.type === 'command').map(m => (m as { command: { id: string } }).command.id)).toEqual(['Klara', 'Klara', 'k'])
    expect(messages.filter(m => m.type === 'output')).toEqual([{ type: 'output', text: 'k 2' }, { type: 'output', text: 'Klara 3' }])
  })

  it('Compiler-, Welt- und Laufzeitfehler mit Zeile', async () => {
    await run('public class Main {\n  public static void main(String[] args) {\n    int x = "a";\n  }\n}')
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'java_compile', range: { line: 3 } } })
    messages.length = 0
    await run('public class Main {\n  public static void main(String[] args) {\n    Klonk klonk = new Klonk();\n    klonk.turnLeft();\n    klonk.step();\n  }\n}')
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'world', params: { worldCode: 'wall' }, range: { line: 5 } } })
    messages.length = 0
    await run('public class Main {\n  public static void main(String[] args) {\n    int a = 0;\n    System.out.println(1 / a);\n  }\n}')
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'java_runtime', range: { line: 4 } } })
  })

  it('ohne import keine Roboter-API; Packages und Startklasse der geöffneten Datei', async () => {
    await run('public class Main {\n  public static void main(String[] args) {\n    new Klonk().step();\n  }\n}', {}, '')
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'java_compile', range: { line: 3 } } })
    messages.length = 0
    const tool = 'package de.tools;\nimport klonk.Klonk;\npublic class Walker {\n  public static void two(Klonk k) { k.step(); k.step(); }\n  public static void main(String[] a) {}\n}'
    const main = 'package de.app;\nimport klonk.Klonk;\nimport de.tools.Walker;\npublic class App {\n  public static void main(String[] args) {\n    Klonk k = new Klonk();\n    Walker.two(k);\n    System.out.println(k.positionX());\n  }\n}'
    await run(main, { path: 'src/de/app/App.java', allowImports: true, files: { 'src/de/tools/Walker.java': tool, 'src/de/app/App.java': main } }, '')
    expect(messages.filter(m => m.type === 'output')).toEqual([{ type: 'output', text: '3' }])
  })

  it('Klonk.create', async () => {
    await run('public class Main {\n  public static void main(String[] args) {\n    Klonk kim = Klonk.create("Kim", "female", 3, 1);\n    kim.step();\n    Klonk.create("Robo");\n    print(kim.name, kim.positionX(), Klonk.all().length);\n  }\n}')
    expect(messages.filter(m => m.type === 'output')).toEqual([{ type: 'output', text: 'Kim 3 3' }])
  })

  it('Bibliotheken JSON/YAML/XML und Designs laden/speichern', async () => {
    const design = { version: 1 as const, base: 'female' as const, colors: { skin: '#e8b48a', shirt: '#aa0000', pants: '#000000', hair: '#000000', eyes: '#000000' }, accessory: 'none' as const }
    await run(`import klonk.JsonObject;
import klonk.Yaml;
import klonk.Xml;
public class Main {
  public static void main(String[] args) {
    JsonObject d = new JsonObject(Klonk.loadDesign("ritter"));
    d.getJsonObject("colors").put("shirt", "#00ff00");
    Klonk.saveDesign("gruen", d);
    Klonk.create("G", d);
    print(d.getString("base"), Yaml.parseObject("a:\\n  b: 2").getJsonObject("a").getInt("b"), Xml.toJson("<r x=\\"1\\"><c>hi</c></r>").getJsonObject("r").getString("c"));
    print(Yaml.stringify(new JsonObject().put("n", 1)).trim());
  }
}`, { designs: { ritter: design }, saveDesigns: true })
    expect(messages.filter(m => m.type === 'output')).toEqual([{ type: 'output', text: 'female 2 hi' }, { type: 'output', text: 'n: 1' }])
    const saved = messages.find(m => m.type === 'saveDesign') as { name: string, design: { colors: { shirt: string } } } | undefined
    expect(saved).toMatchObject({ name: 'gruen', design: { colors: { shirt: '#00ff00' } } })
    expect(messages).toContainEqual(expect.objectContaining({ command: expect.objectContaining({ name: 'createCharacter', character: expect.objectContaining({ id: 'G', design: expect.objectContaining({ colors: expect.objectContaining({ shirt: '#00ff00' }) }) }) }) }))
  })

  it('import klonk.* ⇒ verständliche Meldung', async () => {
    await run('import klonk.*;\npublic class Main {\n  public static void main(String[] args) {\n    JsonObject o = new JsonObject();\n  }\n}', {}, '')
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'java_compile', params: { message: expect.stringContaining('import klonk.JsonObject') } } })
  })
})
