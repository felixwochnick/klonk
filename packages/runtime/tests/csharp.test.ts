import { existsSync } from 'node:fs'
import type { WorldData } from '@klonk/world'
import { beforeEach, describe, expect, it } from 'vitest'
import type { FromWorker, ToWorker } from '../src/protocol'
import { runCSharp } from '../src/csharp/run'
import { CONTROL, createSharedState, views } from '../src/js/shared'

// C#-Host (Roslyn auf .NET-WebAssembly) in Node – vorher `node scripts/build-csharp.ts`
const dir = new URL('../dotnet/', import.meta.url)
const built = existsSync(new URL('dotnet.js', dir))

const world: WorldData = {
  version: 1,
  size: { width: 5, depth: 5, height: 3 },
  cells: [],
  characters: [{ id: 'k', model: 'male', x: 0, z: 0, direction: 'east' }],
}
const messages: FromWorker[] = []
let host: Promise<unknown> | undefined
const createHost = () => {
  host ??= import(new URL('dotnet.js', dir).href).then(m => m.dotnet.create())
  return host as ReturnType<Parameters<typeof runCSharp>[2] & object>
}
// Roboter-API in Zeile 1 einbinden (Zeilennummern bleiben gleich)
const USING = 'using klonk; using static klonk.Klonk; '
const run = (source: string, extra: Partial<Extract<ToWorker, { type: 'run' }>> = {}, using = USING) =>
  runCSharp({ type: 'run', language: 'csharp', source: using + source, world, breakpoints: [], delay: 0, allowImports: false, files: {}, shared: createSharedState(), ...extra }, m => messages.push(m), createHost)

describe.skipIf(!built)('C#', { timeout: 180_000 }, () => {
  it('Prüfpunkte in Methoden und Schleifen (Zeilen werden gemeldet)', async () => {
    const shared = createSharedState()
    // Zeilen werden nur mit Tempo > 0 gemeldet
    Atomics.store(views(shared).control, CONTROL.DELAY, 1)
    await run(`class Program
{
    static int Twice(int x)
    {
        var y = x * 2;
        return y;
    }

    static void Main()
    {
        var sum = 0;
        for (var i = 1; i <= 2; i++) sum += Twice(i);
        Console.WriteLine(sum);
    }
}`, { shared, delay: 1 })
    expect(messages.at(-1)).toEqual({ type: 'done' })
    const lines = new Set(messages.filter(m => m.type === 'line').map(m => (m as { line: number }).line))
    expect(lines.has(11) || lines.has(12)).toBe(true)
  })

  beforeEach(() => {
    messages.length = 0
  })

  it('Top-Level-Programm mit Roboter-Objekt und Ausgabe', async () => {
    await run(`var klonk = new Klonk();
var n = 0;
while (!klonk.IsWall()) { klonk.Step(); n++; }
klonk.TurnRight();
klonk.PlaceBrick(Blue);
Console.WriteLine($"steps {n}");
Print("x", klonk.PositionX(), klonk.IsWall(), new[] { 1, 2 }, klonk);`)
    expect(messages.filter(m => m.type === 'command')).toHaveLength(6)
    expect(messages.filter(m => m.type === 'output')).toEqual([{ type: 'output', text: 'steps 4' }, { type: 'output', text: 'x 5 false [1, 2] Klonk("k")' }])
    expect(messages.at(-1)).toEqual({ type: 'done' })
  })

  it('mehrere Figuren: Name, Nummer, alle', async () => {
    const two: WorldData = { ...world, characters: [...world.characters, { id: 'Klara', model: 'female', x: 0, z: 2, direction: 'east' }] }
    await run('var klara = new Klonk("klara");\nklara.Step(2);\nnew Klonk(1).Step();\nforeach (var r in Klonk.All()) Print(r.Name, r.PositionX());\nnew Klonk("Nobody");', { world: two })
    expect(messages.filter(m => m.type === 'command').map(m => (m as { command: { id: string } }).command.id)).toEqual(['Klara', 'Klara', 'k'])
    expect(messages.filter(m => m.type === 'output')).toEqual([{ type: 'output', text: 'k 2' }, { type: 'output', text: 'Klara 3' }])
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'world', params: { worldCode: 'unknown_character' }, range: { line: 5 } } })
  })

  it('Klasse mit Main, Compiler-, Welt- und Laufzeitfehler mit Zeile', async () => {
    await run('class Program {\n  static void Main() {\n    int x = "a";\n  }\n}')
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'cs_compile', range: { line: 3 } } })
    messages.length = 0
    await run('var k = new Klonk();\nk.TurnLeft();\nk.Step();\n')
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'world', params: { worldCode: 'wall' }, range: { line: 3 } } })
    messages.length = 0
    await run('var a = 0;\nConsole.WriteLine(1 / a);\n')
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'cs_runtime', params: { name: 'DivideByZeroException', message: 'Attempted to divide by zero.' }, range: { line: 2 } } })
  })

  it('Projektdateien nur mit Bibliotheken (Lizenz)', async () => {
    const source = 'var k = new Klonk();\nTools.Helper.Two(k);\nPrint(k.PositionX());'
    const files = { 'Program.cs': USING + source, 'Helper.cs': 'using klonk;\nnamespace Tools;\nstatic class Helper { public static void Two(Klonk k) { k.Step(); k.Step(); } }' }
    await run(source, { files })
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'cs_compile' } })
    messages.length = 0
    await run(source, { files, allowImports: true })
    expect(messages.filter(m => m.type === 'output')).toEqual([{ type: 'output', text: '3' }])
  })

  it('ohne using gibt es keine Roboter-API', async () => {
    await run('var k = new Klonk();', {}, '')
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'cs_compile', range: { line: 1 } } })
  })

  it('Klonk.Create', async () => {
    await run('var kim = Klonk.Create("Kim", "female", 3, 1);\nkim.Step();\nKlonk.Create("Robo");\nPrint(kim.Name, kim.PositionX(), Klonk.All().Length);')
    expect(messages.filter(m => m.type === 'output')).toEqual([{ type: 'output', text: 'Kim 3 3' }])
  })

  it('Bibliotheken: Newtonsoft.Json, YamlDotNet, System.Xml.Linq', async () => {
    await run(`using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using YamlDotNet.Serialization;
using System.Xml.Linq;
var o = JObject.Parse("{ \\"base\\": \\"female\\", \\"colors\\": { \\"shirt\\": \\"#aa0000\\" } }");
Print((string)o["colors"]!["shirt"]!);
Print(JsonConvert.SerializeObject(new { Name = "Kim", Steps = 3 }));
var yaml = new SerializerBuilder().Build().Serialize(new Dictionary<string, object> { ["name"] = "Kim", ["steps"] = 3 });
var back = new DeserializerBuilder().Build().Deserialize<Dictionary<string, string>>(yaml);
Print(back["name"], back["steps"]);
var xml = new XElement("robot", new XAttribute("name", "Kim"), new XElement("color", "red"));
Print(xml.ToString(SaveOptions.DisableFormatting), XElement.Parse("<a><b>1</b></a>").Element("b")!.Value);`)
    expect(messages.at(-1)).toEqual({ type: 'done' })
    expect(messages.filter(m => m.type === 'output')).toEqual([
      { type: 'output', text: '#aa0000' },
      { type: 'output', text: '{"Name":"Kim","Steps":3}' },
      { type: 'output', text: 'Kim 3' },
      { type: 'output', text: '<robot name="Kim"><color>red</color></robot> 1' },
    ])
  })

  it('Designs mit Newtonsoft laden, ändern, speichern', async () => {
    const design = { version: 1 as const, base: 'female' as const, colors: { skin: '#e8b48a', shirt: '#aa0000', pants: '#000000', hair: '#000000', eyes: '#000000' }, accessory: 'none' as const }
    await run('var d = Newtonsoft.Json.Linq.JObject.Parse(Klonk.LoadDesign("ritter"));\nd["colors"]!["shirt"] = "#00ff00";\nKlonk.SaveDesign("gruen", d.ToString());\nKlonk.Create("G", "gruen");\nPrint((string)d["base"]!);', { designs: { ritter: design }, saveDesigns: true })
    expect(messages.filter(m => m.type === 'output')).toEqual([{ type: 'output', text: 'female' }])
    const saved = messages.find(m => m.type === 'saveDesign') as { name: string, design: { colors: { shirt: string } } } | undefined
    expect(saved).toMatchObject({ name: 'gruen', design: { colors: { shirt: '#00ff00' } } })
    expect(messages).toContainEqual(expect.objectContaining({ command: expect.objectContaining({ name: 'createCharacter', character: expect.objectContaining({ id: 'G', design: expect.objectContaining({ colors: expect.objectContaining({ shirt: '#00ff00' }) }) }) }) }))
  })
})
