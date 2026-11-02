import { describe, expect, it } from 'vitest'
import { createJavaService } from '../src/java/complete'

const service = createJavaService('de')
const at = (source: string) => ({ source: source.replace('|', ''), offset: source.indexOf('|') })
const labels = (source: string, files: Record<string, string> = {}) => {
  const { source: s, offset } = at(source)
  return service.complete(s, offset, files).map(i => i.label)
}

describe('Java-Vervollständigung', () => {
  const head = 'import klonk.Klonk;\nimport static klonk.Klonk.*;\npublic class Main {\n  static int zaehler = 0;\n  static void hilfe(Klonk robot) {}\n  public static void main(String[] args) {\n'

  it('Methoden einer Figur nach dem Punkt, auch bei halbfertigem Code', () => {
    const items = labels(`${head}    Klonk karl = new Klonk("Karl");\n    karl.|\n`)
    expect(items).toContain('step')
    expect(items).toContain('isWall')
    expect(items).toContain('name')
    expect(items).not.toContain('all')
    expect(labels(`${head}    Klonk.|`)).toEqual(expect.arrayContaining(['all', 'RED', 'sleep', 'create']))
  })

  it('Variablen, Parameter, Felder, eigene Methoden, statische Importe', () => {
    const items = labels(`${head}    int anzahl = 3;\n    for (Klonk r : Klonk.all()) {\n      an|`)
    expect(items).toEqual(expect.arrayContaining(['anzahl', 'r', 'args', 'zaehler', 'hilfe', 'RED', 'sleep', 'Klonk', 'while']))
  })

  it('Klassen aus anderen Projektdateien mit ihren Mitgliedern', () => {
    const files = { 'src/de/tools/Walker.java': 'package de.tools;\npublic class Walker {\n  public static void zwei(Klonk k) {}\n  public int schritte;\n  public void laufe() {}\n}' }
    expect(labels(`${head}    Walker.|`, files)).toEqual(['zwei'])
    expect(labels(`${head}    Walker w = new Walker();\n    w.|`, files)).toEqual(expect.arrayContaining(['schritte', 'laufe']))
    expect(labels(`${head}    System.out.|`)).toContain('println')
    expect(labels(`${head}    String t = "a";\n    t.|`)).toContain('length')
  })

  it('Klonk ohne Import ⇒ Vorschlag ergänzt den Import; Erklärung beim Darüberfahren', () => {
    const { source, offset } = at('public class Main {\n  void f() {\n    Kl|\n  }\n}')
    expect(service.complete(source, offset).find(i => i.label === 'Klonk')?.addImport).toBe('import klonk.Klonk;')
    const hover = at(`${head}    Klonk k = new Klonk();\n    k.isW|all();\n`)
    expect(service.hover(hover.source, hover.offset)?.documentation).toContain('Rand der Welt')
    const variable = at(`${head}    int anzahl = 3;\n    anz|ahl++;\n`)
    expect(service.hover(variable.source, variable.offset)?.detail).toBe('int anzahl')
  })
})
