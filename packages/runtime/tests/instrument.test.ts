import { describe, expect, it } from 'vitest'
import { CHECKPOINT, instrument, InstrumentationError } from '../src/js/instrument'
import { stripTypes } from '../src/js/transpile'

/** Instrumentierten Code ausführen und Prüfpunkte mitschreiben */
function run(source: string) {
  const hits: { line: number, vars: Record<string, unknown> }[] = []
  const code = instrument(source)
  new Function(CHECKPOINT, code)((line: number, vars: () => Record<string, unknown>) => hits.push({ line, vars: vars() }))
  return hits
}

describe('instrument', () => {
  it('Prüfpunkt vor jeder Anweisung mit sichtbaren Variablen', () => {
    const hits = run('let a = 1\nconst b = a + 1\nfunction f(x) {\n  return x * 2\n}\nf(b)')
    expect(hits.map(h => h.line)).toEqual([1, 2, 6, 4])
    expect(hits[1]!.vars).toEqual({ a: 1 })
    expect(hits[3]!.vars).toMatchObject({ a: 1, b: 2, x: 2 })
  })

  it('Schleifen – auch ohne Block oder leer – bekommen Prüfpunkte', () => {
    const hits = run('let i = 0\nwhile (i < 3) i++\nfor (let j = 0; j < 2; j++) {}\ndo { i-- } while (i > 0)')
    expect(hits.filter(h => h.line === 2)).toHaveLength(4)
    expect(hits.filter(h => h.line === 3)).toHaveLength(3)
    expect(hits.find(h => h.line === 3 && h.vars.j === 1)).toBeTruthy()
  })

  it('Zeilen bleiben erhalten', () => {
    const source = 'let x = 1\n\nif (x) x++\nelse x--\n'
    expect(instrument(source).split('\n')).toHaveLength(source.split('\n').length)
  })

  it('Syntaxfehler mit Position', () => {
    expect(() => instrument('let x = ;')).toThrow(InstrumentationError)
    try {
      instrument('let x = 1\nif (x {')
    }
    catch (e) {
      expect((e as InstrumentationError).detail).toMatchObject({ code: 'js_syntax', line: 2 })
    }
  })

  it('Importe werden erkannt', () => {
    try {
      instrument('import { a } from "./lib"\na()')
      throw new Error('kein Fehler')
    }
    catch (e) {
      expect((e as InstrumentationError).detail.code).toBe('js_import')
    }
  })

  it('TypeScript: Typen entfernen, Zeilen bleiben gleich', () => {
    const ts = 'type P = { x: number }\nconst p: P = { x: 1 }\nfunction twice(n: number): number {\n  return n * 2\n}\ntwice(p.x)'
    const js = stripTypes(ts)
    expect(js.split('\n')).toHaveLength(ts.split('\n').length)
    expect(run(js).map(h => h.line)).toEqual([2, 6, 4])
  })
})
