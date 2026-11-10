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
    'export type KlonkDesign = { version: 1, name?: string, base: \'male\' | \'female\' | \'diverse\', colors: { skin: string, shirt: string, pants: string, hair: string, eyes: string, accessory?: string, outfit?: string }, skin?: \'none\' | \'worker\' | \'doctor\' | \'chef\' | \'police\' | \'firefighter\' | \'astronaut\' | \'knight\' | \'pirate\' | \'farmer\', accessory?: \'none\' | \'cap\' | \'hat\' | \'helmet\' | \'crown\' | \'beanie\' | \'headphones\' | \'glasses\' | \'chefHat\' | \'cowboyHat\' | \'wizardHat\' | \'pirateHat\' | \'spaceHelmet\' | \'knightHelmet\' | \'bow\' }',
    doc(lang === 'de' ? 'Design des Projekts als JSON-Text (Lizenz) – mit JSON.parse lesen' : 'Design of the project as JSON text (license) – read it with JSON.parse'),
    'export function loadDesign(name: string): string',
    doc(lang === 'de' ? 'Design ins Projekt speichern (Datei name.klonkdesign.json, Lizenz)' : 'Save a design to the project (file name.klonkdesign.json, license)'),
    'export function saveDesign(name: string, design: KlonkDesign | string): void',
  )
  const de = lang === 'de'
  lines.push(
    doc(de ? 'Datenbank des Projekts (Database.open("schule") ⇒ Datei schule.sqlite.sql bzw. schule.postgres.sql) oder nur für diesen Lauf (Database.memory()). Platzhalter: SQLite ?, PostgreSQL $1' : 'Project database (Database.open("school") ⇒ file school.sqlite.sql or school.postgres.sql) or one just for this run (Database.memory()). Placeholders: SQLite ?, PostgreSQL $1'),
    'export class Database {',
    '  private constructor()',
    '  readonly name: string',
    '  readonly engine: \'sqlite\' | \'postgres\'',
    doc(de ? 'Datenbank des Projekts öffnen (Dateiname ohne Endung)' : 'Open a project database (file name without extension)', '  '),
    '  static open(name: string): Database',
    doc(de ? 'Neue, leere Datenbank nur für diesen Lauf' : 'New, empty database just for this run', '  '),
    '  static memory(engine?: \'sqlite\' | \'postgres\'): Database',
    doc(de ? 'Abfrage ⇒ Zeilen als Objekte (Spalte ⇒ Wert)' : 'Query ⇒ rows as objects (column ⇒ value)', '  '),
    '  query<T = Record<string, any>>(sql: string, params?: unknown[]): T[]',
    doc(de ? 'Erste Zeile oder null' : 'First row or null', '  '),
    '  queryOne<T = Record<string, any>>(sql: string, params?: unknown[]): T | null',
    doc(de ? 'Ändernde Anweisung (INSERT, UPDATE, DELETE, CREATE …) ⇒ Zahl geänderter Zeilen' : 'Changing statement (INSERT, UPDATE, DELETE, CREATE …) ⇒ number of changed rows', '  '),
    '  execute(sql: string, params?: unknown[]): number',
    doc(de ? 'Namen der Tabellen und Sichten' : 'Names of the tables and views', '  '),
    '  tables(): string[]',
    '}',
    doc(de ? 'Fehler der Datenbank (z. B. Syntaxfehler im SQL) – mit try/catch abfangbar' : 'Database error (e.g. SQL syntax error) – catch it with try/catch'),
    'export class DatabaseError extends Error {}',
  )
  // console schreibt wie print in die Ausgabe (ohne DOM-Typen sonst unbekannt)
  const console = 'declare const console: { log(...values: unknown[]): void, info(...values: unknown[]): void, warn(...values: unknown[]): void, error(...values: unknown[]): void }'
  return `declare module 'klonk' {\n${lines.map(l => `  ${l}`).join('\n')}\n}\n${console}\n`
}
