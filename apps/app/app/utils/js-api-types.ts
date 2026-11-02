import { BUILTINS, type Builtin, type ScriptLanguage } from '@klonk/klonk-script'

const RETURNS: Record<string, string> = { brickCount: 'number', positionX: 'number', positionY: 'number', random: 'number' }

/** Erklärungen zur Klasse `Klonk` (Rest kommt aus den Klonk-Script-Tabellen) */
export const KLONK_CLASS_DOC = {
  class: {
    de: 'Eine Figur der Welt. `new Klonk()` ist die erste Figur, `new Klonk("Klara")` die mit diesem Namen, `new Klonk(2)` die zweite.',
    en: 'A character in the world. `new Klonk()` is the first character, `new Klonk("Klara")` the one with this name, `new Klonk(2)` the second one.',
  },
  all: { de: 'Alle Figuren der Welt.', en: 'All characters in the world.' },
  name: { de: 'Name der Figur (wie im Welt-Editor).', en: 'Name of the character (as in the world editor).' },
}

/**
 * TypeScript-Deklarationen der Roboter-API (für Autovervollständigung und Typprüfung in Monaco):
 * Modul `klonk` mit Klasse `Klonk` (Befehle/Sensoren als Methoden), Funktionen und Farben.
 * Erzeugt aus denselben Tabellen wie Klonk-Script; Dokumentation in der UI-Sprache.
 */
export function robotApiDeclarations(lang: ScriptLanguage) {
  const brickColors = Object.entries(BUILTINS).filter(([, b]) => b.kind === 'constant').map(([name, b]) => [name, [...b.names.en]] as const)
  const colorType = brickColors.flatMap(([, names]) => names).map(n => `'${n}'`).join(' | ')
  const markColorType = brickColors.filter(([name]) => ['yellow', 'red', 'blue', 'green'].includes(name)).flatMap(([, names]) => names).map(n => `'${n}'`).join(' | ')
  const doc = (text: string, indent = '') => `${indent}/** ${text.replace(/\*\//g, '')} */`

  const lines = [
    '// Roboter-API von Klonk (englische Namen) – nur per import aus "klonk" verfügbar',
    `export type KlonkColor = ${colorType}`,
    `export type KlonkMarkColor = ${markColorType}`,
  ]
  const methods: string[] = []

  for (const [name, builtin] of Object.entries(BUILTINS) as [string, Builtin][]) {
    // Ausgabe und Zufall wie gewohnt (console.log, Math.random) – nicht in der Bibliothek
    if (name === 'selectCharacter' || name === 'createCharacter' || name === 'print' || name === 'random') continue
    for (const spelling of builtin.names.en) {
      if (builtin.kind === 'constant') {
        lines.push(doc(builtin.doc[lang]), `export const ${spelling}: '${name}'`)
        continue
      }
      const params = (builtin.params ?? []).map((p) => {
        const type = p.type === 'color' ? 'KlonkColor' : p.type === 'markColor' ? 'KlonkMarkColor' : p.type === 'any' ? 'unknown' : p.type
        return name === 'print' ? `...${p.name.en[0]}: unknown[]` : `${p.name.en[0]}${p.optional ? '?' : ''}: ${type}`
      })
      const returns = builtin.kind === 'sensor' ? (RETURNS[name] ?? 'boolean') : (RETURNS[name] ?? 'void')
      if (builtin.kind === 'function') lines.push(doc(builtin.doc[lang]), `export function ${spelling}(${params.join(', ')}): ${returns}`)
      else methods.push(doc(builtin.doc[lang], '  '), `  ${spelling}(${params.join(', ')}): ${returns}`)
    }
  }

  lines.push(
    doc(KLONK_CLASS_DOC.class[lang]),
    'export class Klonk {',
    '  constructor(name?: string | number)',
    doc(KLONK_CLASS_DOC.name[lang], '  '),
    '  readonly name: string',
    doc(KLONK_CLASS_DOC.all[lang], '  '),
    '  static all(): Klonk[]',
    doc(BUILTINS.createCharacter.doc[lang], '  '),
    '  static create(name: string, look?: \'male\' | \'female\' | \'diverse\' | (string & {}) | KlonkDesign, x?: number, y?: number): Klonk',
    ...methods,
    '}',
  )
  lines.push(
    '/** Eigenes Design (Datei *.klonkdesign.json) */',
    'export type KlonkDesign = { version: 1, name?: string, base: \'male\' | \'female\' | \'diverse\', colors: { skin: string, shirt: string, pants: string, hair: string, eyes: string, accessory?: string }, accessory?: \'none\' | \'cap\' | \'hat\' | \'helmet\' | \'crown\' }',
    doc(lang === 'de' ? 'Design des Projekts als JSON-Text (Lizenz) – mit JSON.parse lesen' : 'Design of the project as JSON text (license) – read it with JSON.parse'),
    'export function loadDesign(name: string): string',
    doc(lang === 'de' ? 'Design ins Projekt speichern (Datei name.klonkdesign.json, Lizenz)' : 'Save a design to the project (file name.klonkdesign.json, license)'),
    'export function saveDesign(name: string, design: KlonkDesign | string): void',
  )
  // console schreibt wie print in die Ausgabe (ohne DOM-Typen sonst unbekannt)
  const console = 'declare const console: { log(...values: unknown[]): void, info(...values: unknown[]): void, warn(...values: unknown[]): void, error(...values: unknown[]): void }'
  return `declare module 'klonk' {\n${lines.map(l => `  ${l}`).join('\n')}\n}\n${console}\n`
}
