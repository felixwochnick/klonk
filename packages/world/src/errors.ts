/**
 * Fehler beim Ausführen eines Befehls. `code` wird in der Oberfläche/den Sprachen übersetzt
 * (z. B. `world.errors.wall`), `params` liefert Details wie Position oder Richtung.
 */
export type WorldErrorCode
  = | 'wall'
    | 'block'
    | 'too_high'
    | 'occupied'
    | 'stack_full'
    | 'no_brick'
    | 'no_mark'
    | 'unknown_character'
    | 'no_character'
    | 'invalid_name'
    | 'duplicate_name'
    | 'character_limit'
    | 'invalid_world'

export class WorldError extends Error {
  constructor(
    public readonly code: WorldErrorCode,
    public readonly params: Record<string, string | number> = {},
  ) {
    super(code)
    this.name = 'WorldError'
  }
}
