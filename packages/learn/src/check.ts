import { Interpreter, parse, type Statement } from '@klonk/klonk-script'
import { World, type CellData, type WorldData } from '@klonk/world'
import type { Outline, Routine, StructBlock } from '@klonk/diagrams'
import { localize, type CheckFailure, type Construct, type LearnDatabase, type LearnTask, type Outcome, type SchemaTable, type SqlRow, type TaskCheck } from './types'

/** Führt ein vertrauenswürdiges Programm (Musterlösung) ohne Animation aus */
export async function runTrusted(source: string, start: WorldData): Promise<Outcome> {
  const world = new World(start)
  const output: string[] = []
  await Interpreter.fromSource(source, world, { print: text => output.push(text), wait: async () => {}, random: () => 0.5 }).run()
  return { world: world.toJSON(), output }
}

/** Zielzustände einer Klonk-Script-Aufgabe (Reihe E): Ergebnis der Musterlösung in jeder Startwelt */
export function expectedOutcomes(task: LearnTask): Promise<Outcome[]> {
  return Promise.all(task.worlds.map(world => runTrusted(task.solution!.de, world)))
}

/** Anzahl der Startsituationen: Startwelten bzw. (ohne Welt) Datensätze der Datenbanken */
export function scenarioCount(task: LearnTask) {
  return Math.max(task.worlds.length, ...(task.databases ?? []).map(db => (Array.isArray(db.sql) ? db.sql.length : 1)), 1)
}

/** SQL einer Datenbank in Startsituation `index` (fehlt eine eigene, gilt die letzte) */
export function databaseSql(database: LearnDatabase, index: number, lang: 'de' | 'en') {
  const list = Array.isArray(database.sql) ? database.sql : [database.sql]
  return localize(list[Math.min(index, list.length - 1)]!, lang)
}

/** Tabellen, deren Inhalt bzw. Aufbau die Prüfung braucht (Namen in der UI-Sprache) */
export const checkedTables = (check: TaskCheck, lang: 'de' | 'en') => (check.tables ?? []).map(t => localize(t, lang))
export const checkedSchema = (check: TaskCheck, lang: 'de' | 'en') => (check.schema ?? []).map(t => localize(t, lang))

const cellKey = (c: CellData) => `${c.x},${c.z}`
const cellValue = (c?: CellData) => JSON.stringify([c?.bricks ?? [], c?.mark ?? null, !!c?.block])
const numbers = (output: string[]) => (output.join('\n').match(/-?\d+(?:[.,]\d+)?/g) ?? []).map(n => Number(n.replace(',', '.')))
const lines = (output: string[]) => output.join('\n').split('\n').map(l => l.trim().replace(/\s+/g, ' ').toLowerCase()).filter(Boolean)

/** Wert für den Vergleich: Zahlen gerundet (Gleitkomma), Wahrheitswerte als 0/1 (SQLite kennt keine) */
function cellText(value: unknown) {
  if (typeof value === 'number') return `n:${Math.round(value * 1e6) / 1e6}`
  if (typeof value === 'boolean') return `n:${value ? 1 : 0}`
  if (value === null || value === undefined) return 'null'
  return `s:${String(value)}`
}
const rowKey = (row: SqlRow) => JSON.stringify(row.map(cellText))

/**
 * Spalten des Ergebnisses den erwarteten zuordnen: gleichnamige zuerst (Reihenfolge der Spalten frei, wenn die Namen
 * stimmen), die übrigen der Reihe nach (Aliasnamen frei)
 */
function alignColumns(expected: string[], actual: string[]) {
  const used = new Set<number>()
  const mapping: (number | undefined)[] = expected.map((name) => {
    const i = actual.findIndex((a, j) => !used.has(j) && a.toLowerCase() === name.toLowerCase())
    if (i < 0) return undefined
    used.add(i)
    return i
  })
  const rest = actual.map((_, j) => j).filter(j => !used.has(j))
  return mapping.map(i => i ?? rest.shift()!)
}

type Rows = { columns: string[], rows: SqlRow[] }

/** Zeilen vergleichen (Spalten wie `alignColumns`) – `null` = gleich */
function compareRows(expected: Rows, actual: Rows, ordered: boolean):
  | null
  | { code: 'columns', expected: number, actual: number }
  | { code: 'rows', expected: number, actual: number }
  | { code: 'order' }
  | { code: 'values', row: number } {
  if (expected.columns.length !== actual.columns.length) return { code: 'columns', expected: expected.columns.length, actual: actual.columns.length }
  if (expected.rows.length !== actual.rows.length) return { code: 'rows', expected: expected.rows.length, actual: actual.rows.length }
  const mapping = alignColumns(expected.columns, actual.columns)
  const want = expected.rows.map(rowKey)
  const got = actual.rows.map(row => rowKey(mapping.map(i => row[i])))
  const remaining = new Map<string, number>()
  for (const key of got) remaining.set(key, (remaining.get(key) ?? 0) + 1)
  for (const [i, key] of want.entries()) {
    const n = remaining.get(key) ?? 0
    if (!n) return { code: 'values', row: i + 1 }
    remaining.set(key, n - 1)
  }
  if (ordered && want.some((key, i) => key !== got[i])) return { code: 'order' }
  return null
}

/** SQLite-Typ-Affinität (INT ⇒ integer, VARCHAR ⇒ text …) – so bleiben gleichwertige Schreibweisen gleich */
export function sqlAffinity(type: string) {
  const t = type.toUpperCase()
  if (t.includes('INT')) return 'integer'
  if (/CHAR|CLOB|TEXT/.test(t)) return 'text'
  if (!t || t.includes('BLOB')) return 'blob'
  if (/REAL|FLOA|DOUB/.test(t)) return 'real'
  return 'numeric'
}

const lower = (list: string[]) => list.map(s => s.toLowerCase())
const sameSet = (a: string[], b: string[]) => a.length === b.length && lower(a).every(x => lower(b).includes(x))

function compareSchema(expected: SchemaTable[], actual: SchemaTable[]): CheckFailure | null {
  for (const table of expected) {
    const got = actual.find(t => t.name.toLowerCase() === table.name.toLowerCase())
    if (!got) return { code: 'table_missing', table: table.name }
    for (const column of table.columns) {
      const col = got.columns.find(c => c.name.toLowerCase() === column.name.toLowerCase())
      if (!col) return { code: 'schema_column', table: table.name, column: column.name }
      if (sqlAffinity(col.type) !== sqlAffinity(column.type)) return { code: 'schema_type', table: table.name, column: column.name, expected: column.type || sqlAffinity(column.type) }
      // NOT NULL nur, wo verlangt (SQLite meldet `INTEGER PRIMARY KEY` ohne notnull)
      if (column.notNull && !column.primaryKey && !col.notNull && !col.primaryKey) return { code: 'schema_not_null', table: table.name, column: column.name }
    }
    const extra = got.columns.find(c => !table.columns.some(col => col.name.toLowerCase() === c.name.toLowerCase()))
    if (extra) return { code: 'schema_extra', table: table.name, column: extra.name }
    const keys = (t: SchemaTable) => t.columns.filter(c => c.primaryKey).map(c => c.name)
    if (!sameSet(keys(table), keys(got))) return { code: 'schema_key', table: table.name, columns: keys(table).join(', ') }
    for (const fk of table.foreignKeys ?? []) {
      const found = (got.foreignKeys ?? []).some(f => f.table.toLowerCase() === fk.table.toLowerCase() && sameSet(f.columns, fk.columns)
        && (!f.refColumns.filter(Boolean).length || !fk.refColumns.filter(Boolean).length || sameSet(f.refColumns, fk.refColumns)))
      if (!found) return { code: 'schema_foreign', table: table.name, columns: fk.columns.join(', '), target: fk.table }
    }
  }
  return null
}

/** Vergleicht das Ergebnis eines Programms mit dem Zielzustand – `null` = gelöst */
export function compareOutcome(check: TaskCheck, expected: Outcome, actual: Outcome): CheckFailure | null {
  if ((check.position || check.direction) && expected.world) {
    for (const want of expected.world.characters) {
      const got = actual.world?.characters.find(c => c.id.toLowerCase() === want.id.toLowerCase())
      if (!got) return { code: 'character_missing', name: want.id }
      if (check.position && (got.x !== want.x || got.z !== want.z)) {
        return { code: 'position', name: want.id, x: got.x + 1, y: got.z + 1, expectedX: want.x + 1, expectedY: want.z + 1 }
      }
      if (check.direction && got.direction !== want.direction) return { code: 'direction', name: want.id, direction: got.direction, expected: want.direction }
    }
  }
  if (check.cells && expected.world) {
    const wantCells = new Map(expected.world.cells.map(c => [cellKey(c), c]))
    const gotCells = new Map((actual.world?.cells ?? []).map(c => [cellKey(c), c]))
    const keys = [...new Set([...wantCells.keys(), ...gotCells.keys()])].sort()
    for (const key of keys) {
      if (cellValue(wantCells.get(key)) !== cellValue(gotCells.get(key))) {
        const [x, z] = key.split(',').map(Number)
        return { code: 'cell', x: x! + 1, y: z! + 1 }
      }
    }
  }
  if (check.output === 'numbers') {
    const want = numbers(expected.output)
    const got = numbers(actual.output)
    if (want.length !== got.length || want.some((n, i) => Math.abs(n - got[i]!) > 1e-6)) return { code: 'output', expected: want.join(', '), actual: got.join(', ') }
  }
  if (check.output === 'lines') {
    const want = lines(expected.output)
    const got = lines(actual.output)
    if (want.join('\n') !== got.join('\n')) return { code: 'output', expected: want.join(' / '), actual: got.join(' / ') }
  }
  if (check.result && expected.result) {
    if (!actual.result) return { code: 'no_result' }
    const diff = compareRows(expected.result, actual.result, check.result === 'ordered')
    if (diff?.code === 'columns') return { code: 'result_columns', expected: diff.expected, actual: diff.actual }
    if (diff?.code === 'rows') return { code: 'result_rows', expected: diff.expected, actual: diff.actual }
    if (diff?.code === 'order') return { code: 'result_order' }
    if (diff?.code === 'values') return { code: 'result_values', row: diff.row }
  }
  if (check.schema && expected.schema) {
    const failure = compareSchema(expected.schema, actual.schema ?? [])
    if (failure) return failure
  }
  for (const [name, want] of Object.entries(expected.tables ?? {})) {
    const got = actual.tables?.[name]
    if (!got) return { code: 'table_missing', table: name }
    const diff = compareRows({ columns: want.columns, rows: want.rows }, { columns: got.columns, rows: got.rows }, false)
    if (diff?.code === 'rows') return { code: 'table_rows', table: name, expected: diff.expected, actual: diff.actual }
    if (diff) return { code: 'table_values', table: name }
  }
  return null
}

// ---------------------------------------------------------------------------
// Verlangte Sprachbausteine

function* statements(list: Statement[]): Generator<Statement> {
  for (const s of list) {
    yield s
    if ('body' in s) yield* statements(s.body)
    if (s.type === 'If') {
      for (const branch of s.branches) yield* statements(branch.body)
      if (s.otherwise) yield* statements(s.otherwise)
    }
  }
}

/** Ruft sich die eigene Anweisung/Funktion selbst auf? (Aufrufe stehen als `user`-Aufruf im Syntaxbaum) */
const callsItself = (s: Statement) => s.type === 'Definition' && JSON.stringify(s.body).includes(`{"kind":"user","name":${JSON.stringify(s.name)}}`)

const KLONK_NODES: Partial<Record<Construct, (s: Statement) => boolean>> = {
  repeatTimes: s => s.type === 'RepeatTimes',
  repeatWhile: s => s.type === 'RepeatWhile',
  if: s => s.type === 'If',
  procedure: s => s.type === 'Definition',
  function: s => s.type === 'Definition' && s.kind === 'function',
  variable: s => s.type === 'VarDeclaration',
  recursion: callsItself,
}

/** Verlangte Sprachbausteine, die im Klonk-Script-Programm fehlen (Syntaxfehler ⇒ wirft `KlonkError`) */
export function missingConstructs(source: string, requires: Construct[] = []): Construct[] {
  const all = [...statements(parse(source).body)]
  return requires.filter(construct => KLONK_NODES[construct] && !all.some(KLONK_NODES[construct]!))
}

function* blocks(list: StructBlock[]): Generator<StructBlock> {
  for (const b of list) {
    yield b
    if (b.kind === 'if') yield* blocks([...b.then, ...b.else])
    else if (b.kind === 'switch') for (const c of b.cases) yield* blocks(c.body)
    else if (b.kind === 'loop' || b.kind === 'block') yield* blocks(b.body)
  }
}
const blockText = (b: StructBlock) => (b.kind === 'if' ? b.condition : b.kind === 'switch' ? b.subject : b.kind === 'loop' || b.kind === 'block' ? b.header : b.text)

/** Hauptprogramm: Routine `main` bzw. `main`/`Main` der Programmklasse (Java, C#) */
const isMain = (r: Routine) => r.kind === 'main' || /^main$/i.test(r.name)

/**
 * Verlangte Sprachbausteine, die einem Programm in Python, Java, JavaScript, TypeScript oder C# fehlen – geprüft an der
 * Auswertung für Diagramme (`outlineOf` in der App bzw. `@klonk/diagrams`)
 */
export function missingCodeConstructs(outline: Outline, requires: Construct[] = []): Construct[] {
  const own = outline.classes.filter(c => !c.external)
  // Programmklasse (Java/C#): enthält `main` – sie zählt nicht als eigene Klasse
  const programClasses = new Set(outline.routines.filter(r => isMain(r) && r.className).map(r => r.className!))
  const routines = outline.routines.filter(r => !isMain(r))
  const all = outline.routines.flatMap(r => [...blocks(r.body)])
  const tests: Partial<Record<Construct, () => boolean>> = {
    loop: () => all.some(b => b.kind === 'loop'),
    if: () => all.some(b => b.kind === 'if' || b.kind === 'switch'),
    method: () => routines.length > 0,
    returnValue: () => routines.some(r => [...blocks(r.body)].some(b => b.kind === 'exit' && /^return\s+\S/.test(b.text))),
    class: () => own.some(c => !programClasses.has(c.name)),
    inheritance: () => own.some(c => c.extends.some(name => own.some(o => o.name === name))),
    recursion: () => routines.some((r) => {
      const call = new RegExp(`(^|[^\\w.]|\\b(this|self|base|super)\\.)${r.name}\\s*\\(`)
      return [...blocks(r.body)].some(b => call.test(blockText(b)))
    }),
  }
  return requires.filter(construct => tests[construct] && !tests[construct]!())
}

/** SQL ohne Kommentare und Zeichenketten (für die Suche nach Schlüsselwörtern) */
const sqlCode = (sql: string) => sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'|"(?:[^"]|"")*"/g, ' ')

const SQL_TESTS: Partial<Record<Construct, RegExp>> = {
  groupBy: /\bgroup\s+by\b/i,
  subquery: /\(\s*select\b/i,
}

/** Verlangte Bausteine, die einer SQL-Lösung fehlen */
export function missingSqlConstructs(sql: string, requires: Construct[] = []): Construct[] {
  const code = sqlCode(sql)
  return requires.filter(construct => SQL_TESTS[construct] && !SQL_TESTS[construct]!.test(code))
}
