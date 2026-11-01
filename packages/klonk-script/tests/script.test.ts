import { World, type WorldData } from '@klonk/world'
import { describe, expect, it } from 'vitest'
import { Interpreter, KlonkError, check, detectLanguage, parse, translate, type RobotCommand } from '../src'

const worldData = (extra: Partial<WorldData> = {}): WorldData => ({
  version: 1,
  size: { width: 6, depth: 6, height: 4 },
  cells: [],
  characters: [{ id: 'k', model: 'male', x: 0, z: 0, direction: 'east' }],
  ...extra,
})

async function run(source: string, data = worldData(), options: { allowImports?: boolean, files?: Record<string, string> } = {}) {
  const world = new World(data)
  const output: string[] = []
  const commands: RobotCommand[] = []
  const lines: number[] = []
  await Interpreter.fromSource(source, world, {
    print: text => output.push(text),
    command: c => void commands.push(c),
    checkpoint: range => void lines.push(range.line),
    allowImports: options.allowImports,
    resolveImport: path => options.files?.[path],
    random: () => 0.5,
    wait: async () => {},
  }).run()
  return { world, output, commands, lines }
}

async function runError(source: string, data?: WorldData, options?: { allowImports?: boolean, files?: Record<string, string> }) {
  try {
    await run(source, data, options)
  }
  catch (error) {
    if (error instanceof KlonkError) return error
    throw error
  }
  throw new Error('Fehler erwartet')
}

describe('Grundbefehle (deutsch und englisch)', () => {
  it('läuft, dreht und legt Ziegel', async () => {
    const { world } = await run(`
schritt
schritt(2)
rechtsDrehen
hinlegen(blau)
hinlegen
`)
    expect(world.getCharacter('k')).toMatchObject({ x: 3, z: 0, direction: 'south' })
    expect(world.cell({ x: 3, z: 1 }).bricks).toEqual(['blue', 'red'])
  })

  it('englische Schlüsselwörter und gemischte Schreibung', async () => {
    const { world } = await run(`
REPEAT 3 times
  step
END
turnRight
placeBrick(green)
`)
    expect(world.getCharacter('k').x).toBe(3)
    expect(world.cell({ x: 3, z: 1 }).bricks).toEqual(['green'])
  })

  it('meldet Weltfehler mit Zeile', async () => {
    const error = await runError('linksDrehen\nschritt')
    expect(error.code).toBe('world')
    expect(error.params.worldCode).toBe('wall')
    expect(error.range?.line).toBe(2)
  })
})

describe('Kontrollstrukturen', () => {
  it('wiederhole solange nicht istWand', async () => {
    const { world } = await run('wiederhole solange nicht istWand\n  schritt\nende')
    expect(world.getCharacter('k').x).toBe(5)
  })

  it('wiederhole bis und wenn/sonst wenn/sonst', async () => {
    const { output } = await run(`
var i = 0
wiederhole bis i >= 4
  i = i + 1
  wenn i % 2 = 0 dann
    ausgabe("gerade " + i)
  sonst wenn i = 3
    ausgabe("drei")
  sonst
    ausgabe("ungerade")
  ende
ende
`)
    expect(output).toEqual(['ungerade', 'gerade 2', 'drei', 'gerade 4'])
  })

  it('abbrechen und weiter', async () => {
    const { output } = await run(`
var i = 0
wiederhole immer
  i = i + 1
  wenn i = 2 dann weiter ende
  wenn i > 4 dann abbrechen ende
  ausgabe(i)
ende
`)
    expect(output).toEqual(['1', '3', '4'])
  })

  it('stopp beendet das Programm', async () => {
    const { output } = await run('ausgabe(1)\nstopp\nausgabe(2)')
    expect(output).toEqual(['1'])
  })
})

describe('Anweisungen und Funktionen', () => {
  it('eigene Anweisungen mit Parametern, auch vor der Definition aufrufbar', async () => {
    const { world } = await run(`
quadrat(2)

anweisung quadrat(seite)
  wiederhole 4 mal
    schritt(seite)
    rechtsDrehen
  ende
ende
`)
    expect(world.getCharacter('k')).toMatchObject({ x: 0, z: 0, direction: 'east' })
  })

  it('Funktionen mit Rückgabewert und Rekursion', async () => {
    const { output } = await run(`
funktion fakultaet(n)
  wenn n <= 1 dann
    zurück 1
  ende
  zurück n * fakultaet(n - 1)
ende
ausgabe(fakultaet(5))
`)
    expect(output).toEqual(['120'])
  })

  it('Endlosrekursion wird erkannt', async () => {
    expect((await runError('anweisung f\n  f\nende\nf')).code).toBe('stack_overflow')
  })

  it('lokale Variablen überdecken globale', async () => {
    const { output } = await run(`
var x = 1
anweisung zeige(x)
  ausgabe(x)
ende
zeige(5)
ausgabe(x)
`)
    expect(output).toEqual(['5', '1'])
  })
})

describe('Sensoren', () => {
  it('istZiegel, ziegelAnzahl, istMarke, Blickrichtung, Position', async () => {
    const { output } = await run(`
hinlegen(gelb)
hinlegen(rot)
ausgabe(istZiegel)
ausgabe(istZiegel(rot))
ausgabe(istZiegel(gelb))
ausgabe(ziegelAnzahl)
markieren
ausgabe(istMarke)
ausgabe(schautNachOsten)
ausgabe(positionX + "/" + positionY)
`)
    expect(output).toEqual(['true', 'true', 'false', '2', 'true', 'true', '1/1'])
  })

  it('mehrere Figuren mit wähleFigur', async () => {
    const { world } = await run('wähleFigur("b")\nschritt', worldData({
      characters: [
        { id: 'k', model: 'male', x: 0, z: 0, direction: 'east' },
        { id: 'b', model: 'female', x: 0, z: 2, direction: 'east' },
      ],
    }))
    expect(world.getCharacter('b').x).toBe(1)
    expect(world.getCharacter('k').x).toBe(0)
  })
})

describe('Fehler', () => {
  it.each([
    ['wiederhole 3 mal\n  schritt', 'missing_end', 1],
    ['wenn istWand dann\nschritt', 'missing_end', 1],
    ['ende', 'unexpected_end', 1],
    ['wiederhole 3\n schritt\nende', 'expected_times', 1],
    ['var = 3', 'expected_name', 1],
    ['var schritt = 3', 'reserved_name', 1],
    ['abbrechen', 'break_outside_loop', 1],
    ['zurück 1', 'return_outside_function', 1],
    ['ausgabe("offen', 'unterminated_string', 1],
    ['schritt schritt', 'expected_newline', 1],
    ['3 + 4', 'expected_statement', 1],
  ])('Syntax: %j ⇒ %s', (source, code, line) => {
    const [error] = check(source)
    expect(error?.code).toBe(code)
    expect(error?.range?.line).toBe(line)
  })

  it.each([
    ['x = 3', 'undeclared_variable'],
    ['ausgabe(y)', 'unknown_name'],
    ['wiederhole "a" mal\nende', 'expected_count'],
    ['wenn 3 dann\nende', 'expected_boolean'],
    ['ausgabe(1 / 0)', 'division_by_zero'],
    ['hinlegen(5)', 'invalid_color'],
    ['markieren(lila)', 'invalid_color'],
    ['schritt(1, 2)', 'wrong_argument_count'],
    ['unbekannt', 'unknown_name'],
  ])('Laufzeit: %j ⇒ %s', async (source, code) => {
    expect((await runError(source)).code).toBe(code)
  })
})

describe('Bibliotheken', () => {
  const files = { 'figuren.klonk': 'anweisung umdrehen\n  linksDrehen\n  linksDrehen\nende' }

  it('sind ohne Lizenz gesperrt', async () => {
    expect((await runError('importiere "figuren.klonk"\numdrehen', undefined, { files })).code).toBe('feature_libraries')
  })

  it('stellen Anweisungen aus anderen Dateien bereit', async () => {
    const { world } = await run('importiere "figuren.klonk"\numdrehen', undefined, { allowImports: true, files })
    expect(world.getCharacter('k').direction).toBe('west')
  })

  it('fehlende Dateien werden gemeldet', async () => {
    expect((await runError('importiere "gibtsnicht"', undefined, { allowImports: true, files })).code).toBe('import_not_found')
  })
})

describe('Debugger-Prüfpunkte, Befehle und Übersetzen', () => {
  it('meldet jede Anweisung mit Zeile und alle Roboterbefehle', async () => {
    const { lines, commands } = await run('schritt\nwiederhole 2 mal\n  linksDrehen\nende')
    expect(lines).toEqual([1, 2, 3, 3])
    expect(commands).toEqual([
      { name: 'step', id: 'k' },
      { name: 'turnLeft', id: 'k' },
      { name: 'turnLeft', id: 'k' },
    ])
  })

  it('übersetzt deutsch ⇄ englisch und erhält Formatierung und Kommentare', () => {
    const de = `// Ecke suchen
wiederhole solange nicht istWand
  schritt   # weiter
ende
wenn istZiegel(rot) dann
  aufheben
ende`
    const en = translate(de, 'en')
    expect(en).toBe(`// Ecke suchen
repeat while not isWall
  step   # weiter
end
if isBrick(red) then
  pickBrick
end`)
    expect(translate(en, 'de')).toBe(de)
    expect(detectLanguage(de)).toBe('de')
    expect(detectLanguage(en)).toBe('en')
    // Gleicher AST (ohne Positionen, die Wörter sind unterschiedlich lang)
    const strip = (source: string) => JSON.parse(JSON.stringify(parse(source), (key, value) => key === 'range' ? undefined : value))
    expect(strip(en)).toEqual(strip(de))
  })
})
