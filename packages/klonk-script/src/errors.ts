export type SourceRange = { line: number, column: number, endLine: number, endColumn: number }

/**
 * Fehler in Klonk-Script (Syntax oder Laufzeit). `code` wird in der Oberfläche übersetzt
 * (`script.errors.<code>`), `params` liefert Details. Zeilen/Spalten beginnen bei 1.
 */
export class KlonkError extends Error {
  constructor(
    public readonly code: string,
    public readonly params: Record<string, string | number> = {},
    public readonly range?: SourceRange,
  ) {
    super(code)
    this.name = 'KlonkError'
  }
}
