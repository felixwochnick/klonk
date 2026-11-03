import { convertKarolWorld, World } from '@klonk/world'
import { describe, expect, it } from 'vitest'
import { convertKarolProgram, decodeKarolFile, Interpreter, parse } from '../src'

// Eigene Beispiele im Stil von Robot Karol 2/3 (Kommentare, Groß-/Kleinschreibung, *ende/endewiederhole, mehrere Anweisungen je Zeile)
const PROGRAM = `{ Karol räumt auf
  und mauert }
Anweisung Umdrehen
  LinksDrehen LinksDrehen
*Anweisung

Bedingung VorneFrei
  wenn IstWand dann falsch sonst wahr *wenn
*Bedingung

Anweisung TurmAbbauen
  wiederhole
    Aufheben
  *wiederhole bis NichtIstZiegel
endeanweisung

Programm
  wiederhole solange vornefrei
    wenn IstZiegel(2) dann TurmAbbauen *wenn
    Schritt
  endewiederhole
  umdrehen
  Hinlegen(3)
  MarkeSetzen
  Schnell
  Quader
*Programm
`

// 4 × 1 Felder, Höhe 3: Ziegelturm (2) auf x = 2, Karol auf x = 0 mit Blick nach Osten (Karol-Richtung 3)
const WORLD = 'KarolVersion2Deutsch 4 1 3 0 0 3  n n n o  n n n o  z z n o  n n n m'

describe('Robot Karol: Programme', () => {
  it('übersetzt alle Kontrollstrukturen nach Klonk-Script', () => {
    const { source, warnings } = convertKarolProgram(PROGRAM)
    expect(() => parse(source)).not.toThrow()
    expect(source).toContain('// Karol räumt auf')
    expect(source).toContain('anweisung Umdrehen\n  linksDrehen\n  linksDrehen\nende')
    expect(source).toContain('funktion VorneFrei\n  var ergebnis = falsch\n  wenn istWand dann\n    ergebnis = falsch\n  sonst\n    ergebnis = wahr\n  ende\n  zurück ergebnis\nende')
    // Nachprüfende Schleife
    expect(source).toContain('  wiederhole immer\n    aufheben\n    wenn nicht istZiegel dann\n      abbrechen\n    ende\n  ende')
    // Schreibweise der Definition, Bedingung als Funktionsaufruf
    expect(source).toContain('wiederhole solange VorneFrei()')
    expect(source).toContain('wenn ziegelAnzahl == 2 dann')
    expect(source).toContain('\nUmdrehen\nwiederhole 3 mal\n  hinlegen\nende\nmarkieren')
    expect(warnings).toEqual([{ code: 'cube', line: 26, name: 'Quader' }])
  })

  it('läuft in der umgewandelten Welt wie in Robot Karol', async () => {
    const { world } = convertKarolWorld(WORLD)
    const run = new World(world)
    await Interpreter.fromSource(convertKarolProgram(PROGRAM).source, run).run()
    // Turm abgebaut, bis zur Wand gelaufen, umgedreht, 3 Ziegel hingelegt, Marke gesetzt (lag schon)
    const karol = run.getCharacters()[0]!
    expect([karol.x, karol.z, karol.direction]).toEqual([3, 0, 'west'])
    expect(run.cell({ x: 2, z: 0 }).bricks).toEqual(['red', 'red', 'red'])
    expect(run.cell({ x: 3, z: 0 }).mark).toBe('yellow')
  })

  it('meldet Unbekanntes und fehlende Enden', () => {
    const { source, warnings } = convertKarolProgram('Programm\n  wenn IstVoll dann Springen *wenn\n  ton\n')
    expect(warnings.map(w => w.code)).toEqual(['backpack', 'unknown_call', 'sound', 'syntax'])
    expect(source).toContain('wenn falsch dann')
  })

  it('benennt eigene Anweisungen um, die in Klonk-Script Befehle sind', () => {
    const { source } = convertKarolProgram('Anweisung Warte\n  Schritt\n*Anweisung\nWarte')
    expect(source).toBe('anweisung Warte_\n  schritt\nende\n\nWarte_\n')
  })

  it('liest Windows-Dateien (Latin-1) und UTF-8', () => {
    expect(decodeKarolFile(new Uint8Array([0x4D, 0x61, 0x72, 0x6B, 0x65, 0x4C, 0xF6, 0x73, 0x63, 0x68, 0x65, 0x6E]))).toBe('MarkeLöschen')
    expect(decodeKarolFile(new TextEncoder().encode('MarkeLöschen'))).toBe('MarkeLöschen')
  })
})
