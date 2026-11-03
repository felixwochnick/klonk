/**
 * Datenmodell der Diagramme – unabhängig von Sprache und Darstellung. Die Auswertungen (`languages/*`, C# über Roslyn)
 * liefern dieses Modell, die Darstellung (`render/*`) macht daraus SVG.
 */

// ---------------------------------------------------------------------------
// Struktogramm (Nassi-Shneiderman, DIN 66261)

export type StructBlock
  /** Anweisung */
  = | { kind: 'action', text: string, line: number }
    /** Aufruf eines eigenen Unterprogramms (Rechteck mit doppelten Seitenlinien) */
    | { kind: 'call', text: string, line: number }
    /** Aussprung: abbrechen, zurück, stopp, return, break, throw */
    | { kind: 'exit', text: string, line: number }
    /** Verzweigung: Bedingung, Ja- und Nein-Zweig */
    | { kind: 'if', condition: string, then: StructBlock[], else: StructBlock[], line: number }
    /** Fallauswahl: Ausdruck und Fälle (letzter Fall ggf. „sonst“, `label` = null) */
    | { kind: 'switch', subject: string, cases: { label: string | null, body: StructBlock[] }[], line: number }
    /** Schleife: kopfgesteuert (`pre`), fußgesteuert (`post`) oder ohne Bedingung (`none`, Endlosschleife) */
    | { kind: 'loop', test: 'pre' | 'post' | 'none', header: string, body: StructBlock[], line: number }
    /** Gruppe mit Überschrift (try/catch/finally, with, synchronized …) */
    | { kind: 'block', header: string, body: StructBlock[], line: number }

export type RoutineKind = 'main' | 'function' | 'method' | 'constructor'

/** Ein Struktogramm: Hauptprogramm, Funktion oder Methode */
export type Routine = {
  /** Eindeutiger Schlüssel (z. B. `Held.gehe`) */
  id: string
  kind: RoutineKind
  /** Name (beim Hauptprogramm leer – die Oberfläche beschriftet es) */
  name: string
  /** Kopfzeile, z. B. `gehe(n: int): int` */
  signature: string
  className?: string
  line: number
  body: StructBlock[]
}

// ---------------------------------------------------------------------------
// Klassendiagramm (UML)

export type Visibility = 'public' | 'private' | 'protected' | 'package'

export type UmlAttribute = {
  name: string
  type?: string
  visibility: Visibility
  isStatic?: boolean
  /** Konstante (final/readonly) */
  isFinal?: boolean
  line?: number
}

export type UmlParameter = { name: string, type?: string }

export type UmlMethod = {
  name: string
  params: UmlParameter[]
  returnType?: string
  visibility: Visibility
  isStatic?: boolean
  isAbstract?: boolean
  isConstructor?: boolean
  line?: number
}

export type UmlClassKind = 'class' | 'interface' | 'enum' | 'record' | 'struct'

export type UmlClass = {
  name: string
  kind: UmlClassKind
  isAbstract?: boolean
  /** Package/Namespace/Modul */
  namespace?: string
  attributes: UmlAttribute[]
  methods: UmlMethod[]
  enumValues?: string[]
  /** Oberklassen (Java/C#/JS: eine, Python: mehrere) */
  extends: string[]
  implements: string[]
  /** Datei im Projekt und Zeile der Deklaration */
  path?: string
  line?: number
  /** Klasse aus einer Bibliothek (z. B. `Klonk`) – nur Name, ohne Inhalt */
  external?: boolean
}

export type ClassModel = { classes: UmlClass[] }

export type UmlRelationKind = 'generalization' | 'realization' | 'association'

export type UmlRelation = {
  kind: UmlRelationKind
  /** Klasse, von der die Beziehung ausgeht (Unterklasse bzw. Klasse mit dem Attribut) */
  from: string
  to: string
  /** Assoziation: Rolle (Attributname) und Multiplizität am Ziel */
  role?: string
  multiplicity?: string
}

/** Auswertung einer Datei bzw. eines Programms */
export type Outline = {
  routines: Routine[]
  classes: UmlClass[]
}

// ---------------------------------------------------------------------------
// Objektdiagramm (Speicherabbild beim Anhalten)

/** Wert eines Attributs/einer Variablen: einfacher Wert (als Text) oder Verweis auf ein Objekt */
export type HeapValue = { value: string } | { ref: number }

export type HeapObject = {
  id: number
  /** Klasse (bzw. `list`, `dict`, `ArrayList` …) */
  className: string
  /** Attribute in Deklarationsreihenfolge; bei Listen `[0]`, `[1]` …, bei Wörterbüchern die Schlüssel */
  fields: [string, HeapValue][]
  /** Figur der Welt (Klonk-Objekte) – Lage und Blickrichtung ergänzt die Oberfläche */
  robot?: string
  /** Weitere Einträge wurden weggelassen */
  more?: boolean
}

export type HeapSnapshot = {
  /** Variablen am Haltepunkt (inkl. `this`/`self`), Reihenfolge wie im Programm */
  variables: [string, HeapValue][]
  objects: HeapObject[]
  /** Mehr Objekte, als angezeigt werden */
  truncated?: boolean
}

// ---------------------------------------------------------------------------
// ER-Diagramm (aus dem Schema einer Datenbank)

/** Schema einer Tabelle, wie es die Datenbank-Engines liefern (siehe `@klonk/runtime` `SqlTable`) */
export type SchemaTable = {
  name: string
  kind: 'table' | 'view'
  columns: { name: string, type: string, primaryKey: boolean, notNull: boolean, unique?: boolean }[]
  foreignKeys?: { columns: string[], table: string, refColumns: string[] }[]
}

export type ErAttribute = { name: string, type: string, key: boolean, foreign: boolean, notNull: boolean }

export type ErEntity = { name: string, attributes: ErAttribute[] }

/** Seite einer Beziehung: Entität mit Kardinalität (Chen: 1/n/m) und (min,max) */
export type ErEnd = { entity: string, chen: '1' | 'n' | 'm', min: 0 | 1, max: '1' | 'n' | 'm' }

export type ErRelationship = {
  name: string
  ends: [ErEnd, ErEnd]
  /** Eigene Attribute (bei n:m-Beziehungen aus der Zwischentabelle) */
  attributes: ErAttribute[]
  /** Zwischentabelle (n:m) bzw. Tabelle mit dem Fremdschlüssel */
  table: string
}

export type ErModel = { entities: ErEntity[], relationships: ErRelationship[], tables: SchemaTable[] }
