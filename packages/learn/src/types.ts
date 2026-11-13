import type { Direction, WorldData } from '@klonk/world'

/** Text je UI-Sprache (Markdown: Absätze, `code`, **fett**, Listen mit „- “, Codeblöcke) */
export type Text = { de: string, en: string }

/** Sprachbausteine, die eine Aufgabe verlangen kann (geprüft am Syntaxbaum) */
export const CONSTRUCTS = ['repeatTimes', 'repeatWhile', 'if', 'procedure', 'function', 'variable'] as const
export type Construct = typeof CONSTRUCTS[number]

/** Was nach dem Programm mit dem Ergebnis der Musterlösung übereinstimmen muss */
export type TaskCheck = {
  /** Feld, auf dem die Figur am Ende steht */
  position?: boolean
  direction?: boolean
  /** Ziegel, Marken und Quader aller Felder */
  cells?: boolean
  /** Ausgabe: nur die Zahlen darin vergleichen (Formulierung ist frei) */
  output?: 'numbers'
}

export type LearnTask = {
  /** Eindeutig innerhalb des Moduls (Teil der URL) */
  id: string
  title: Text
  /** Aufgabenstellung für die Lernenden */
  text: Text
  hints?: Text[]
  /** Startwelten: das Programm muss in allen das Ziel erreichen (verhindert Abzählen) */
  worlds: WorldData[]
  /** Musterlösung in Klonk-Script je Sprache – daraus entsteht auch der Zielzustand */
  solution: Text
  check: TaskCheck
  requires?: Construct[]
}

export type LearnModule = {
  /** Eindeutig, Teil der URL */
  id: string
  /** Einstieg (Grundschule, Förderschule; Welten aus 3×3-Platten, druckbar) – sonst Grundkurs */
  track?: 'start'
  title: Text
  /** Ein Satz für die Übersicht */
  summary: Text
  objectives: Text[]
  /** Einführung in das neue Thema für die Lernenden (mit Beispiel) */
  intro: Text
  /** Hinweise für Lehrkräfte (Zeitbedarf, typische Fehler, Differenzierung) – nur in der App für Lehrkräfte, nie in der öffentlichen Doku */
  teacher: Text
  tasks: LearnTask[]
}

/** Ergebnis eines Programmlaufs auf einer Startwelt */
export type Outcome = { world: WorldData, output: string[] }

/** Warum ein Programm eine Welt nicht löst (Koordinaten ab 1 wie `positionX`/`positionY`) */
export type CheckFailure
  = | { code: 'position', x: number, y: number, expectedX: number, expectedY: number }
    | { code: 'direction', direction: Direction, expected: Direction }
    | { code: 'cell', x: number, y: number }
    | { code: 'output', expected: string, actual: string }
    | { code: 'character_missing' }
