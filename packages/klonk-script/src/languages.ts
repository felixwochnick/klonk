/**
 * Schlüsselwörter und eingebaute Befehle von Klonk-Script je Sprache.
 * Alle Sprachen sind gleichzeitig gültig und werden auf dieselben kanonischen Namen abgebildet;
 * neue Sprachen = neue Spalte. Die erste Schreibweise ist die bevorzugte (Autovervollständigung, Übersetzen).
 */
export const SCRIPT_LANGUAGES = ['de', 'en'] as const
export type ScriptLanguage = typeof SCRIPT_LANGUAGES[number]

type Spellings = Record<ScriptLanguage, string[]>

export const KEYWORDS = {
  repeat: { de: ['wiederhole'], en: ['repeat'] },
  times: { de: ['mal'], en: ['times'] },
  while: { de: ['solange'], en: ['while'] },
  until: { de: ['bis'], en: ['until'] },
  forever: { de: ['immer'], en: ['forever'] },
  if: { de: ['wenn'], en: ['if'] },
  then: { de: ['dann'], en: ['then'] },
  else: { de: ['sonst'], en: ['else'] },
  end: { de: ['ende'], en: ['end'] },
  procedure: { de: ['anweisung'], en: ['procedure'] },
  function: { de: ['funktion'], en: ['function'] },
  return: { de: ['zurück', 'zurueck'], en: ['return'] },
  break: { de: ['abbrechen'], en: ['break'] },
  continue: { de: ['weiter'], en: ['continue'] },
  var: { de: ['var'], en: ['var'] },
  import: { de: ['importiere'], en: ['import'] },
  and: { de: ['und'], en: ['and'] },
  or: { de: ['oder'], en: ['or'] },
  not: { de: ['nicht'], en: ['not'] },
  true: { de: ['wahr'], en: ['true'] },
  false: { de: ['falsch'], en: ['false'] },
  stop: { de: ['stopp'], en: ['stop'] },
} satisfies Record<string, Spellings>

export type Keyword = keyof typeof KEYWORDS

export type BuiltinKind = 'command' | 'sensor' | 'function' | 'constant'

export type BuiltinParam = { name: Spellings, optional?: boolean, type: 'number' | 'color' | 'markColor' | 'string' | 'any' }

export type Builtin = {
  kind: BuiltinKind
  names: Spellings
  params?: BuiltinParam[]
  /** Beschreibung je Sprache (Hover/Autovervollständigung) */
  doc: Record<ScriptLanguage, string>
}

const color: BuiltinParam = { name: { de: ['farbe'], en: ['color'] }, optional: true, type: 'color' }
const markColor: BuiltinParam = { name: { de: ['farbe'], en: ['color'] }, optional: true, type: 'markColor' }

export const BUILTINS = {
  // Befehle der Figur
  step: { kind: 'command', names: { de: ['schritt'], en: ['step'] }, params: [{ name: { de: ['anzahl'], en: ['count'] }, optional: true, type: 'number' }], doc: { de: 'Geht ein Feld (oder `anzahl` Felder) vorwärts. Stufen bis zu einem Ziegel werden überstiegen.', en: 'Moves one cell (or `count` cells) forward. Steps of up to one brick are climbed.' } },
  turnLeft: { kind: 'command', names: { de: ['linksDrehen'], en: ['turnLeft'] }, doc: { de: 'Dreht die Figur um 90° nach links.', en: 'Turns the character 90° to the left.' } },
  turnRight: { kind: 'command', names: { de: ['rechtsDrehen'], en: ['turnRight'] }, doc: { de: 'Dreht die Figur um 90° nach rechts.', en: 'Turns the character 90° to the right.' } },
  placeBrick: { kind: 'command', names: { de: ['hinlegen'], en: ['placeBrick'] }, params: [color], doc: { de: 'Legt einen Ziegel (Standard: rot) auf das Feld vor der Figur.', en: 'Places a brick (default: red) on the cell in front of the character.' } },
  pickBrick: { kind: 'command', names: { de: ['aufheben'], en: ['pickBrick'] }, doc: { de: 'Nimmt den obersten Ziegel vor der Figur weg.', en: 'Picks up the top brick in front of the character.' } },
  setMark: { kind: 'command', names: { de: ['markieren'], en: ['setMark'] }, params: [markColor], doc: { de: 'Markiert das Feld, auf dem die Figur steht (Standard: gelb).', en: 'Marks the cell the character stands on (default: yellow).' } },
  removeMark: { kind: 'command', names: { de: ['markeLöschen', 'markeLoeschen'], en: ['removeMark'] }, doc: { de: 'Entfernt die Marke unter der Figur.', en: 'Removes the mark under the character.' } },
  selectCharacter: { kind: 'command', names: { de: ['wähleFigur', 'waehleFigur'], en: ['selectCharacter'] }, params: [{ name: { de: ['name'], en: ['name'] }, type: 'string' }], doc: { de: 'Alle folgenden Befehle steuern die Figur mit diesem Namen.', en: 'All following commands control the character with this name.' } },

  // Sensoren
  isWall: { kind: 'sensor', names: { de: ['istWand'], en: ['isWall'] }, doc: { de: '`wahr`, wenn vor der Figur der Rand der Welt oder ein Quader ist.', en: '`true` if the edge of the world or a block is in front of the character.' } },
  isBrick: { kind: 'sensor', names: { de: ['istZiegel'], en: ['isBrick'] }, params: [color], doc: { de: '`wahr`, wenn vor der Figur ein Ziegel liegt (optional: mit dieser Farbe obenauf).', en: '`true` if there is a brick in front of the character (optionally: with this color on top).' } },
  isMark: { kind: 'sensor', names: { de: ['istMarke'], en: ['isMark'] }, params: [markColor], doc: { de: '`wahr`, wenn die Figur auf einer Marke steht (optional: dieser Farbe).', en: '`true` if the character stands on a mark (optionally: of this color).' } },
  isFacingNorth: { kind: 'sensor', names: { de: ['schautNachNorden'], en: ['isFacingNorth'] }, doc: { de: '`wahr`, wenn die Figur nach Norden schaut.', en: '`true` if the character faces north.' } },
  isFacingEast: { kind: 'sensor', names: { de: ['schautNachOsten'], en: ['isFacingEast'] }, doc: { de: '`wahr`, wenn die Figur nach Osten schaut.', en: '`true` if the character faces east.' } },
  isFacingSouth: { kind: 'sensor', names: { de: ['schautNachSüden', 'schautNachSueden'], en: ['isFacingSouth'] }, doc: { de: '`wahr`, wenn die Figur nach Süden schaut.', en: '`true` if the character faces south.' } },
  isFacingWest: { kind: 'sensor', names: { de: ['schautNachWesten'], en: ['isFacingWest'] }, doc: { de: '`wahr`, wenn die Figur nach Westen schaut.', en: '`true` if the character faces west.' } },
  brickCount: { kind: 'sensor', names: { de: ['ziegelAnzahl'], en: ['brickCount'] }, doc: { de: 'Anzahl der Ziegel vor der Figur.', en: 'Number of bricks in front of the character.' } },
  positionX: { kind: 'sensor', names: { de: ['positionX'], en: ['positionX'] }, doc: { de: 'Spalte, in der die Figur steht (ab 1).', en: 'Column the character stands in (from 1).' } },
  positionY: { kind: 'sensor', names: { de: ['positionY'], en: ['positionY'] }, doc: { de: 'Zeile, in der die Figur steht (ab 1).', en: 'Row the character stands in (from 1).' } },

  // Allgemeine Funktionen
  print: { kind: 'function', names: { de: ['ausgabe'], en: ['print'] }, params: [{ name: { de: ['text'], en: ['text'] }, type: 'any' }], doc: { de: 'Schreibt einen Text in die Ausgabe.', en: 'Writes text to the output.' } },
  wait: { kind: 'function', names: { de: ['warte'], en: ['wait'] }, params: [{ name: { de: ['sekunden'], en: ['seconds'] }, optional: true, type: 'number' }], doc: { de: 'Wartet die angegebene Zeit (Standard: 1 Sekunde).', en: 'Waits for the given time (default: 1 second).' } },
  random: { kind: 'function', names: { de: ['zufall'], en: ['random'] }, params: [{ name: { de: ['von'], en: ['from'] }, type: 'number' }, { name: { de: ['bis'], en: ['to'] }, type: 'number' }], doc: { de: 'Zufällige ganze Zahl zwischen `von` und `bis` (einschließlich).', en: 'Random whole number between `from` and `to` (inclusive).' } },

  // Farben
  red: { kind: 'constant', names: { de: ['rot'], en: ['red'] }, doc: { de: 'Farbe Rot', en: 'Color red' } },
  blue: { kind: 'constant', names: { de: ['blau'], en: ['blue'] }, doc: { de: 'Farbe Blau', en: 'Color blue' } },
  yellow: { kind: 'constant', names: { de: ['gelb'], en: ['yellow'] }, doc: { de: 'Farbe Gelb', en: 'Color yellow' } },
  green: { kind: 'constant', names: { de: ['grün', 'gruen'], en: ['green'] }, doc: { de: 'Farbe Grün', en: 'Color green' } },
  orange: { kind: 'constant', names: { de: ['orange'], en: ['orange'] }, doc: { de: 'Farbe Orange', en: 'Color orange' } },
  purple: { kind: 'constant', names: { de: ['lila'], en: ['purple'] }, doc: { de: 'Farbe Lila', en: 'Color purple' } },
  white: { kind: 'constant', names: { de: ['weiß', 'weiss'], en: ['white'] }, doc: { de: 'Farbe Weiß', en: 'Color white' } },
  black: { kind: 'constant', names: { de: ['schwarz'], en: ['black'] }, doc: { de: 'Farbe Schwarz', en: 'Color black' } },
} satisfies Record<string, Builtin>

export type BuiltinName = keyof typeof BUILTINS

/** Kleingeschriebene Schreibweise ⇒ kanonischer Name */
function index<T extends string>(table: Record<T, { de: string[], en: string[] } | { names: Spellings }>) {
  const map = new Map<string, T>()
  for (const [canonical, entry] of Object.entries(table) as [T, { de: string[], en: string[] } | { names: Spellings }][]) {
    const spellings = 'names' in entry ? entry.names : entry
    for (const lang of SCRIPT_LANGUAGES) for (const s of spellings[lang]) map.set(s.toLowerCase(), canonical)
  }
  return map
}

export const KEYWORD_INDEX = index<Keyword>(KEYWORDS)
export const BUILTIN_INDEX = index<BuiltinName>(BUILTINS)

/** Bevorzugte Schreibweise eines Schlüsselworts/Befehls in einer Sprache */
export function spell(canonical: Keyword | BuiltinName, lang: ScriptLanguage) {
  if (canonical in KEYWORDS) return KEYWORDS[canonical as Keyword][lang][0]!
  return BUILTINS[canonical as BuiltinName].names[lang][0]!
}
