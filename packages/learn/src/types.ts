import type { Direction, WorldData } from '@klonk/world'

/** Text je UI-Sprache (Markdown: Absätze, `code`, **fett**, Listen mit „- “, Codeblöcke) */
export type Text = { de: string, en: string }
/** Für beide UI-Sprachen gleich (z. B. Code) oder je Sprache */
export type Localized = string | Text
export const localize = (value: Localized, lang: 'de' | 'en') => (typeof value === 'string' ? value : value[lang])

/**
 * Reihen der Lernmodule, Kürzel E1, F1, S1, A1 …: Einfach (Klonk-Script & Blöcke, E1–E3 Einstieg), Fortgeschritten (Programmiersprachen),
 * SQL und Anwendungen (Programmiersprache + Datenbank). Die Module einer Reihe bauen aufeinander auf.
 */
export const LEARN_TRACKS = ['basics', 'advanced', 'sql', 'apps'] as const
export type LearnTrack = typeof LEARN_TRACKS[number]
export const TRACK_CODES: Record<LearnTrack, string> = { basics: 'E', advanced: 'F', sql: 'S', apps: 'A' }

/** Programmiersprachen der Reihen F und A (Roboter- und Datenbank-API nur englisch) */
export const CODE_LANGUAGES = ['python', 'java', 'javascript', 'typescript', 'csharp'] as const
export type CodeLanguage = typeof CODE_LANGUAGES[number]
export const isCodeLanguage = (value: string): value is CodeLanguage => (CODE_LANGUAGES as readonly string[]).includes(value)

/**
 * Musterlösungen je Programmiersprache (TypeScript fehlt ⇒ wie JavaScript); JavaScript liefert den Zielzustand.
 * Java-Lösungen heißen `public class Program` – in der deutschen Oberfläche wie die Datei `Programm.java`.
 */
export type CodeSolutions = { python: string, java: string, javascript: string, typescript?: string, csharp: string }
export function codeSolution(solutions: CodeSolutions, language: CodeLanguage, lang: 'de' | 'en' = 'en') {
  const source = solutions[language] ?? solutions.javascript
  return language === 'java' && lang === 'de' ? source.replace(/\bclass Program\b/, 'class Programm') : source
}

/**
 * Sprachbausteine, die eine Aufgabe verlangen kann. Klonk-Script prüft am Syntaxbaum, die Programmiersprachen an der
 * Auswertung für Diagramme (`@klonk/diagrams`), SQL am Text.
 */
export const CONSTRUCTS = [
  // Klonk-Script
  'repeatTimes', 'repeatWhile', 'procedure', 'function', 'variable',
  // Klonk-Script und Programmiersprachen
  'if', 'recursion',
  // Programmiersprachen
  'loop', 'method', 'returnValue', 'class', 'inheritance',
  // SQL
  'groupBy', 'subquery',
] as const
export type Construct = typeof CONSTRUCTS[number]

/** Was nach dem Programm mit dem Ergebnis der Musterlösung übereinstimmen muss */
export type TaskCheck = {
  /** Feld, auf dem jede Figur am Ende steht */
  position?: boolean
  direction?: boolean
  /** Ziegel, Marken und Quader aller Felder */
  cells?: boolean
  /** Ausgabe: nur die Zahlen darin (Formulierung frei) bzw. die Zeilen (Leerraum und Groß-/Kleinschreibung egal) */
  output?: 'numbers' | 'lines'
  /** SQL: Ergebnis der letzten Abfrage mit Spalten (Spaltennamen frei); `ordered` = Reihenfolge der Zeilen zählt */
  result?: 'ordered' | 'unordered'
  /** Inhalt dieser Tabellen nach dem Lauf (Reihenfolge der Zeilen egal) */
  tables?: Localized[]
  /** Aufbau dieser Tabellen (CREATE TABLE): Spalten, Typ-Affinität, NOT NULL, Primär- und Fremdschlüssel */
  schema?: Localized[]
}

/**
 * Datenbank einer Aufgabe (SQLite). `name` = Datei im Aufgabenordner (`<name>.sqlite.sql`) und Name für `Database.open`.
 * `sql` als Liste: eigene Daten je Startsituation (Index wie `worlds`, sonst die letzte) – verhindert abgezählte Lösungen.
 */
export type LearnDatabase = { name: Localized, sql: Localized | Localized[] }

export type LearnTask = {
  /** Eindeutig innerhalb des Moduls (Teil der URL) */
  id: string
  title: Text
  /** Aufgabenstellung für die Lernenden */
  text: Text
  hints?: Text[]
  /**
   * Startwelten: das Programm muss in allen das Ziel erreichen (verhindert Abzählen). SQL-Aufgaben ohne Welt: leer –
   * die Startsituationen ergeben sich dann aus den Daten der Datenbank.
   */
  worlds: WorldData[]
  /**
   * Datenbanken: SQL-Aufgaben fragen die erste ab, Programme öffnen sie mit `Database.open(name)`. Jeder Lauf beginnt
   * mit einer frischen Kopie.
   */
  databases?: LearnDatabase[]
  /** SQL-Aufgaben: die Tabellen der Startwelt sind die Datenbank (wie „Welt als Datenbank“, Namen in der UI-Sprache) */
  worldDatabase?: boolean
  /** Musterlösung in Klonk-Script (Reihe E) bzw. SQL (Reihe S) je UI-Sprache – daraus entsteht der Zielzustand */
  solution?: Text
  /** Musterlösungen der Reihen F und A (Roboter- und Datenbank-API englisch, gleich für beide UI-Sprachen) */
  solutions?: CodeSolutions
  check: TaskCheck
  requires?: Construct[]
  /** Figuren, die die Aufgabe höchstens braucht (gilt auch über die Lizenzgrenze hinaus) */
  characters?: number
}

export type LearnModule = {
  /** Eindeutig, Teil der URL */
  id: string
  track: LearnTrack
  /** Einstieg (Grundschule, Förderschule): Welten aus ganzen 3×3-Platten – lassen sich ausdrucken bzw. nachbauen */
  printable?: boolean
  title: Text
  /** Ein Satz für die Übersicht */
  summary: Text
  objectives: Text[]
  /** Module, auf denen dieses aufbaut (auch aus anderen Reihen, z. B. A1 auf F3 und S4) */
  prerequisites?: string[]
  /** Einführung in das neue Thema für die Lernenden (mit Beispiel) */
  intro: Text
  /** Hinweise für Lehrkräfte (Zeitbedarf, typische Fehler, Differenzierung) – nur in der App für Lehrkräfte, nie in der öffentlichen Doku */
  teacher: Text
  tasks: LearnTask[]
}

/** Werte einer Tabellenzeile, wie sie die Datenbank liefert (SQLite: Zahl, Text, null) */
export type SqlRow = unknown[]
/** Aufbau einer Tabelle (wie `SqlTable` in `@klonk/runtime`, ohne Zeilenzahl) */
export type SchemaTable = {
  name: string
  columns: { name: string, type: string, primaryKey: boolean, notNull: boolean }[]
  foreignKeys?: { columns: string[], table: string, refColumns: string[] }[]
}

/** Ergebnis eines Laufs in einer Startsituation */
export type Outcome = {
  /** Welt am Ende (SQL-Aufgaben ohne Welt: null) */
  world: WorldData | null
  output: string[]
  /** SQL: letztes Ergebnis mit Spalten (null = keine Abfrage mit Ergebnis) */
  result?: { columns: string[], rows: SqlRow[] } | null
  /** Inhalt der Tabellen in `check.tables` (Name wie dort ⇒ Spalten und Zeilen) */
  tables?: Record<string, { columns: string[], rows: SqlRow[] }>
  /** Aufbau der Tabellen, nur die in `check.schema` */
  schema?: SchemaTable[]
}

/** Warum ein Programm eine Startsituation nicht löst (Koordinaten ab 1 wie `positionX`/`positionY`) */
export type CheckFailure
  = | { code: 'position', name: string, x: number, y: number, expectedX: number, expectedY: number }
    | { code: 'direction', name: string, direction: Direction, expected: Direction }
    | { code: 'cell', x: number, y: number }
    | { code: 'output', expected: string, actual: string }
    | { code: 'character_missing', name: string }
    | { code: 'no_result' }
    | { code: 'result_columns', expected: number, actual: number }
    | { code: 'result_rows', expected: number, actual: number }
    | { code: 'result_values', row: number }
    | { code: 'result_order' }
    | { code: 'table_missing', table: string }
    | { code: 'table_rows', table: string, expected: number, actual: number }
    | { code: 'table_values', table: string }
    | { code: 'schema_column', table: string, column: string }
    | { code: 'schema_extra', table: string, column: string }
    | { code: 'schema_type', table: string, column: string, expected: string }
    | { code: 'schema_not_null', table: string, column: string }
    | { code: 'schema_key', table: string, columns: string }
    | { code: 'schema_foreign', table: string, columns: string, target: string }
