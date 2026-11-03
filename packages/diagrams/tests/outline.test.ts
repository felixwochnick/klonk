import { describe, expect, it } from 'vitest'
import { classRelations, erModel, javaOutline, javascriptOutline, klonkOutline, pythonOutline, renderClassDiagram, renderEr, renderObjectDiagram, renderRelationalSchema, renderStructograms, type StructBlock } from '../src'

const LABELS = { main: 'Hauptprogramm', yes: 'wahr', no: 'falsch', otherwise: 'sonst' }
const UML = { interface: 'interface', enumeration: 'enumeration', abstract: 'abstract', record: 'record', struct: 'struct' }

/** Kurzform eines Struktogramms für Vergleiche */
function shape(blocks: StructBlock[]): unknown[] {
  return blocks.map((b) => {
    switch (b.kind) {
      case 'if': return { if: b.condition, then: shape(b.then), else: shape(b.else) }
      case 'loop': return { [b.test]: b.header, body: shape(b.body) }
      case 'switch': return { switch: b.subject, cases: b.cases.map(k => [k.label, shape(k.body)]) }
      case 'block': return { block: b.header, body: shape(b.body) }
      default: return `${b.kind}:${b.text}`
    }
  })
}

describe('Klonk-Script', () => {
  it('Hauptprogramm, Schleifen, Verzweigung und eigene Anweisung', () => {
    const outline = klonkOutline(`wiederhole 3 mal
  schritt()
  wenn istWand() dann
    linksDrehen()
  sonst wenn istZiegel() dann
    aufheben()
  sonst
    hinlegen("rot")
  ende
ende
wiederhole solange nicht istWand() # bis zur Wand
  quadrat()
ende
anweisung quadrat()
  wiederhole immer
    abbrechen
  ende
ende`)
    expect(outline.routines.map(r => r.kind)).toEqual(['main', 'function'])
    expect(shape(outline.routines[0]!.body)).toEqual([
      { pre: 'wiederhole 3 mal', body: ['action:schritt()', { if: 'istWand()', then: ['action:linksDrehen()'], else: [{ if: 'istZiegel()', then: ['action:aufheben()'], else: ['action:hinlegen("rot")'] }] }] },
      { pre: 'wiederhole solange nicht istWand()', body: ['call:quadrat()'] },
    ])
    expect(outline.routines[1]!.signature).toBe('anweisung quadrat()')
    expect(shape(outline.routines[1]!.body)).toEqual([{ none: 'wiederhole immer', body: ['exit:abbrechen'] }])
  })

  it('Blöcke: Markierungen im Kommentar stören nicht', () => {
    const outline = klonkOutline('schritt() #@abc\nwiederhole 2 mal #@def\n  linksDrehen() #@ghi\nende')
    expect(shape(outline.routines[0]!.body)).toEqual(['action:schritt()', { pre: 'wiederhole 2 mal', body: ['action:linksDrehen()'] }])
  })
})

describe('Java', () => {
  const source = `package spiel;
import klonk.Klonk;
public abstract class Figur implements Comparable<Figur> {
  protected String name;
  private static int anzahl = 0;
  public Figur(String name) { this.name = name; anzahl++; }
  public abstract void bewegen(int schritte);
}
class Held extends Figur {
  private Klonk klonk;
  private java.util.List<Figur> freunde;
  Held(String name) { super(name); }
  public void bewegen(int schritte) {
    for (int i = 0; i < schritte; i++) {
      if (klonk.isWall()) { drehen(); } else klonk.step();
    }
    do { schritte--; } while (schritte > 0);
    switch (schritte) { case 1: case 2: drehen(); break; default: return; }
  }
  private void drehen() { klonk.turnLeft(); }
}
interface Fliegend { void fliegen(); }
enum Farbe { ROT, GRUEN }`

  it('Klassen mit Sichtbarkeit, statischen und abstrakten Elementen', () => {
    const { classes } = javaOutline(source, 'src/spiel/Figur.java')
    const figur = classes.find(c => c.name === 'Figur')!
    expect(figur).toMatchObject({ kind: 'class', isAbstract: true, namespace: 'spiel', implements: ['Comparable<Figur>'], path: 'src/spiel/Figur.java' })
    expect(figur.attributes).toEqual([
      expect.objectContaining({ name: 'name', type: 'String', visibility: 'protected' }),
      expect.objectContaining({ name: 'anzahl', type: 'int', visibility: 'private', isStatic: true }),
    ])
    expect(figur.methods).toEqual([
      expect.objectContaining({ name: 'Figur', isConstructor: true, params: [{ name: 'name', type: 'String' }] }),
      expect.objectContaining({ name: 'bewegen', isAbstract: true, returnType: 'void' }),
    ])
    expect(classes.find(c => c.name === 'Held')).toMatchObject({ extends: ['Figur'] })
    expect(classes.find(c => c.name === 'Fliegend')).toMatchObject({ kind: 'interface', methods: [expect.objectContaining({ isAbstract: true, visibility: 'public' })] })
    expect(classes.find(c => c.name === 'Farbe')).toMatchObject({ kind: 'enum', enumValues: ['ROT', 'GRUEN'] })
  })

  it('Beziehungen: Vererbung, Implementierung, Assoziationen mit Multiplizität', () => {
    const { relations, classes } = classRelations({ classes: javaOutline(source).classes })
    expect(relations).toEqual(expect.arrayContaining([
      { kind: 'generalization', from: 'Held', to: 'Figur' },
      { kind: 'realization', from: 'Figur', to: 'Comparable' },
      { kind: 'association', from: 'Held', to: 'Klonk', role: 'klonk', multiplicity: undefined },
      { kind: 'association', from: 'Held', to: 'Figur', role: 'freunde', multiplicity: '*' },
    ]))
    expect(classes.find(c => c.name === 'Klonk')).toMatchObject({ external: true })
  })

  it('Struktogramm einer Methode mit Aufruf, fußgesteuerter Schleife und Fallauswahl', () => {
    const routine = javaOutline(source).routines.find(r => r.name === 'bewegen')!
    expect(routine.signature).toBe('bewegen(schritte: int): void')
    expect(shape(routine.body)).toEqual([
      { pre: 'for (int i = 0; i < schritte; i++)', body: [{ if: 'klonk.isWall()', then: ['call:drehen()'], else: ['action:klonk.step()'] }] },
      { post: 'while (schritte > 0)', body: ['action:schritte--'] },
      { switch: 'schritte', cases: [['1, 2', ['call:drehen()']], [null, ['exit:return']]] },
    ])
  })
})

describe('Python', () => {
  const source = `from klonk import Klonk

class Figur:
    anzahl = 0

    def __init__(self, name: str, klonk: Klonk):
        self.name = name
        self._klonk = klonk
        self.__punkte = 0
        self.freunde: list[Figur] = []

    @staticmethod
    def neu() -> "Figur":
        return Figur("x", Klonk())

    def laufen(self, n=1):
        while not self._klonk.is_wall():
            self._klonk.step()
        if n > 1:
            self.drehen()
        elif n == 0:
            pass
        else:
            return

    def drehen(self):
        self._klonk.turn_left()

class Held(Figur):
    pass

def hilfe(x):
    for i in range(x):
        print(i)

f = Figur("a", Klonk())
hilfe(3)
`
  it('Klassen, Attribute aus self.x, Sichtbarkeit nach Unterstrichen', () => {
    const { classes } = pythonOutline(source, 'spiel/figur.py')
    const figur = classes.find(c => c.name === 'Figur')!
    expect(figur.namespace).toBe('spiel.figur')
    expect(figur.attributes.map(a => [a.name, a.type, a.visibility, !!a.isStatic])).toEqual([
      ['anzahl', 'int', 'public', true],
      ['name', 'str', 'public', false],
      ['_klonk', 'Klonk', 'protected', false],
      ['__punkte', 'int', 'private', false],
      ['freunde', 'list[Figur]', 'public', false],
    ])
    expect(figur.methods.map(m => [m.name, m.params.map(p => p.name), !!m.isStatic])).toEqual([
      ['__init__', ['name', 'klonk'], false],
      ['neu', [], true],
      ['laufen', ['n'], false],
      ['drehen', [], false],
    ])
    expect(classes.find(c => c.name === 'Held')!.extends).toEqual(['Figur'])
  })

  it('Struktogramme: Hauptprogramm, Funktion, elif-Kette, Aufrufe', () => {
    const { routines } = pythonOutline(source)
    expect(routines[0]).toMatchObject({ kind: 'main' })
    expect(shape(routines[0]!.body)).toEqual(['action:f = Figur("a", Klonk())', 'call:hilfe(3)'])
    const laufen = routines.find(r => r.name === 'laufen')!
    expect(shape(laufen.body)).toEqual([
      { pre: 'while not self._klonk.is_wall()', body: ['action:self._klonk.step()'] },
      { if: 'n > 1', then: ['call:self.drehen()'], else: [{ if: 'n == 0', then: ['action:pass'], else: ['exit:return'] }] },
    ])
    expect(shape(routines.find(r => r.name === 'hilfe')!.body)).toEqual([{ pre: 'for i in range(x)', body: ['action:print(i)'] }])
  })
})

describe('JavaScript/TypeScript', () => {
  it('Klassen mit Feldern, this.x, Parametereigenschaften und Hauptprogramm', () => {
    const source = `import { Klonk } from 'klonk'
interface Beweglich { bewegen(n: number): void }
abstract class Figur implements Beweglich {
  static anzahl = 0
  #geheim = 1
  protected klonk: Klonk
  constructor(public name: string) { this.klonk = new Klonk(name); this.punkte = 0 }
  abstract bewegen(n: number): void
  get position(): number { return 1 }
}
class Held extends Figur {
  bewegen(n: number) {
    for (let i = 0; i < n; i++) this.klonk.step()
    switch (n) { case 1: this.springen(); break; default: break }
  }
  springen() {}
}
const h = new Held('Klara')
h.bewegen(3)
`
    const { classes, routines } = javascriptOutline(source, 'src/main.ts', true)
    const figur = classes.find(c => c.name === 'Figur')!
    expect(figur).toMatchObject({ isAbstract: true, implements: ['Beweglich'] })
    expect(figur.attributes.map(a => [a.name, a.type, a.visibility, !!a.isStatic])).toEqual([
      ['anzahl', 'number', 'public', true],
      ['#geheim', 'number', 'private', false],
      ['klonk', 'Klonk', 'protected', false],
      ['name', 'string', 'public', false],
      ['punkte', 'number', 'public', false],
      ['position', 'number', 'public', false],
    ])
    expect(classes.find(c => c.name === 'Beweglich')).toMatchObject({ kind: 'interface' })
    expect(routines[0]!.kind).toBe('main')
    expect(shape(routines[0]!.body)).toEqual(['action:const h = new Held(\'Klara\')', 'action:h.bewegen(3)'])
    expect(shape(routines.find(r => r.name === 'bewegen' && r.className === 'Held')!.body)).toEqual([
      { pre: 'for (let i = 0; i < n; i++)', body: ['action:this.klonk.step()'] },
      { switch: 'n', cases: [['1', ['call:this.springen()']], [null, []]] },
    ])
  })

  it('Funktionen (auch Pfeilfunktionen) mit try/catch', () => {
    const { routines } = javascriptOutline(`function f(a) {\n  try { g(a) } catch (e) { console.log(e) } finally { done() }\n}\nconst g = (x) => x * 2\nf(1)`)
    expect(routines.map(r => r.signature)).toEqual(['', 'f(a)', 'g(x)'])
    expect(shape(routines[1]!.body)).toEqual([
      { block: 'try', body: ['call:g(a)'] },
      { block: 'catch (e)', body: ['action:console.log(e)'] },
      { block: 'finally', body: ['action:done()'] },
    ])
    expect(shape(routines[2]!.body)).toEqual(['exit:return x * 2'])
  })
})

describe('ER-Modell', () => {
  const schema = [
    { name: 'klassen', kind: 'table' as const, columns: [{ name: 'id', type: 'INTEGER', primaryKey: true, notNull: true }, { name: 'name', type: 'TEXT', primaryKey: false, notNull: true }] },
    { name: 'schueler', kind: 'table' as const, columns: [{ name: 'id', type: 'INTEGER', primaryKey: true, notNull: true }, { name: 'vorname', type: 'TEXT', primaryKey: false, notNull: false }, { name: 'klasse_id', type: 'INTEGER', primaryKey: false, notNull: true }], foreignKeys: [{ columns: ['klasse_id'], table: 'klassen', refColumns: ['id'] }] },
    { name: 'kurse', kind: 'table' as const, columns: [{ name: 'id', type: 'INTEGER', primaryKey: true, notNull: true }] },
    { name: 'belegt', kind: 'table' as const, columns: [{ name: 'schueler_id', type: 'INTEGER', primaryKey: true, notNull: true }, { name: 'kurs_id', type: 'INTEGER', primaryKey: true, notNull: true }, { name: 'note', type: 'INTEGER', primaryKey: false, notNull: false }], foreignKeys: [{ columns: ['schueler_id'], table: 'schueler', refColumns: ['id'] }, { columns: ['kurs_id'], table: 'kurse', refColumns: ['id'] }] },
    { name: 'v', kind: 'view' as const, columns: [] },
  ]

  it('1:n aus Fremdschlüsseln, n:m aus Zwischentabellen', () => {
    const model = erModel(schema)
    expect(model.entities.map(e => e.name)).toEqual(['klassen', 'schueler', 'kurse'])
    expect(model.relationships).toEqual([
      { name: 'klasse', table: 'schueler', attributes: [], ends: [{ entity: 'schueler', chen: 'n', min: 1, max: '1' }, { entity: 'klassen', chen: '1', min: 0, max: 'n' }] },
      { name: 'belegt', table: 'belegt', attributes: [expect.objectContaining({ name: 'note' })], ends: [{ entity: 'schueler', chen: 'n', min: 0, max: 'n' }, { entity: 'kurse', chen: 'm', min: 0, max: 'n' }] },
    ])
  })

  it('zeichnet alle Darstellungen', () => {
    const model = erModel(schema)
    for (const notation of ['chen', 'minmax', 'crowsfoot'] as const) {
      const { svg, width, height } = renderEr(model, { notation })
      expect(svg).toContain('data-table="schueler"')
      expect(width).toBeGreaterThan(100)
      expect(height).toBeGreaterThan(50)
    }
    expect(renderEr(model, { notation: 'minmax' }).svg).toContain('(1,1)')
    expect(renderRelationalSchema(model, {}).svg).toContain('↑klasse_id')
  })
})

describe('Darstellung', () => {
  it('Struktogramm mit Zeilen zum Anklicken und hervorgehobener Zeile', () => {
    const outline = javaOutline('class A { void f(int n) { if (n > 0) { g(); } while (n > 0) n--; } void g() {} }')
    const { svg } = renderStructograms(outline.routines, { labels: LABELS, activeLine: 1 })
    expect(svg).toContain('data-kind="if"')
    expect(svg).toContain('data-kind="call"')
    expect(svg).toContain('A.f(n: int): void')
    expect(svg).toContain('#fde68a')
  })

  it('Klassen- und Objektdiagramm', () => {
    const { svg } = renderClassDiagram({ classes: javaOutline('class A { private B b; } class B extends A {}').classes }, { labels: UML })
    expect(svg).toContain('data-class="A"')
    expect(svg).toContain('- b: B')
    const objects = renderObjectDiagram({
      variables: [['held', { ref: 1 }], ['n', { value: '3' }]],
      objects: [{ id: 1, className: 'Held', fields: [['name', { value: '"Klara"' }], ['freund', { ref: 2 }]] }, { id: 2, className: 'Held', fields: [['freund', { ref: 1 }]] }],
    }, { labels: { variables: 'Variablen', more: '…' } })
    expect(objects.svg).toContain('held : Held')
    expect(objects.svg).toContain('n = 3')
    expect(objects.svg).toContain('name = &quot;Klara&quot;')
  })
})
