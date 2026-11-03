import { BUILTINS, show, type BuiltinName, type RobotCommand, type Value } from '@klonk/klonk-script'
import { BRICK_COLORS, MARK_COLORS, WorldError, parseDesign, resolveLook, type RobotDesign, type World } from '@klonk/world'
import type { DbRequest, DbResponse } from '../protocol'
import { SQL_ENGINES, type SqlEngineName, type SqlResult, type SqlValue } from '../db/types'

export type ApiHost = {
  world: World
  command: (command: RobotCommand) => void
  print: (text: string) => void
  sleep: (ms: number) => void
  /** Eigene Designs für `create` (nur mit Lizenz) und Höchstzahl der Figuren */
  designs?: Record<string, RobotDesign>
  maxCharacters?: number
  /** Design ins Projekt speichern (nur mit Lizenz und geöffnetem Projekt) */
  saveDesign?: (name: string, design: RobotDesign) => void
  /** Datenbankzugriff (synchron, siehe db/channel.ts) */
  database?: (request: DbRequest) => DbResponse
  /** Jeder API-Fehler, bevor er geworfen wird (Sprachen, deren Laufzeit JS-Fehler umverpackt, merken ihn sich) */
  onError?: (error: ApiError) => void
}

/** Fehler in Aufrufen der Roboter-API (z. B. falsche Farbe) – wird wie Klonk-Script-Fehler übersetzt */
export class ApiError extends Error {
  constructor(public readonly code: string, public readonly params: Record<string, string | number> = {}) {
    super(code)
  }
}

/** Fehler der Datenbank (z. B. Syntaxfehler im SQL) – in Programmen abfangbar, Meldung der Datenbank */
export class DatabaseError extends ApiError {
  constructor(message: string) {
    super('sql_error', { message })
    this.name = 'DatabaseError'
    this.message = message
  }
}

/** Geöffnete Datenbank aus Sicht der Programme */
export type DatabaseInfo = { handle: number, name: string, engine: SqlEngineName }

/** Farbe in kanonischer Form (`'Red'`, `'red'` ⇒ `'red'`) – nur englische Namen */
function color<T extends string>(value: unknown, allowed: readonly T[]): T {
  const canonical = typeof value === 'string' ? value.toLowerCase() : value
  if (typeof canonical !== 'string' || !allowed.includes(canonical as T)) throw new ApiError('invalid_color', { value: String(value) })
  return canonical as T
}

/** Darstellung beliebiger JS-Werte (Ausgabe, Variablenansicht) */
export function display(value: unknown, depth = 0): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return show(value as Value)
  if (typeof value === 'function') return `ƒ ${value.name || '(anonym)'}`
  const custom = (value as Record<symbol, unknown>)[ROBOT_DISPLAY]
  if (typeof custom === 'function') return String(custom.call(value))
  if (depth > 2) return '…'
  if (Array.isArray(value)) return `[${value.slice(0, 20).map(v => display(v, depth + 1)).join(', ')}${value.length > 20 ? ', …' : ''}]`
  try {
    const entries = Object.entries(value as object).slice(0, 20)
    return `{ ${entries.map(([k, v]) => `${k}: ${display(v, depth + 1)}`).join(', ')} }`
  }
  catch {
    return String(value)
  }
}

/** Befehle, die in den Objekt-Sprachen keine Methoden einer Figur sind (`Klonk.create`, Wechseln = anderes Objekt) */
export const CLASS_COMMANDS: readonly BuiltinName[] = ['selectCharacter', 'createCharacter']

/** Methoden einer Figur: Befehle und Sensoren */
export const ROBOT_METHODS = (Object.keys(BUILTINS) as BuiltinName[])
  .filter(name => (BUILTINS[name].kind === 'command' || BUILTINS[name].kind === 'sensor') && !CLASS_COMMANDS.includes(name))

/**
 * Funktionen und Farbkonstanten der Klonk-Script-Tabellen. In den Objekt-Sprachen gibt es davon nur `wait` und die Farben –
 * Ausgabe und Zufall nehmen dort die Mittel der Sprache selbst (console.log, print, System.out.println, Math.random …).
 */
export const GLOBAL_NAMES = (Object.keys(BUILTINS) as BuiltinName[])
  .filter(name => BUILTINS[name].kind === 'function' || BUILTINS[name].kind === 'constant')

export type RobotHandle = { readonly name: string } & Record<string, (...args: unknown[]) => unknown>

export type RobotApi = {
  /** `wait`, Farben, `loadDesign`/`saveDesign` (englische Namen) */
  globals: Record<string, unknown>
  /** Figur nach Name (ohne Groß-/Kleinschreibung) oder Nummer (ab 1); ohne Angabe die erste */
  robot: (name?: unknown) => RobotHandle
  /** Namen aller Figuren in Weltreihenfolge */
  names: () => string[]
  /** Ausgabe (console.log) */
  print: (...values: unknown[]) => void
  /** Neue Figur (Aussehen: Standardmodell oder eigenes Design; Feld 1-basiert, sonst neben der zuletzt genutzten) */
  create: (name: unknown, look?: unknown, x?: unknown, y?: unknown) => RobotHandle
  /** Datenbanken: Projektdatenbank öffnen, temporäre anlegen, Abfragen (wirft DatabaseError bei SQL-Fehlern) */
  db: {
    open: (name: unknown) => DatabaseInfo
    memory: (engine?: unknown) => DatabaseInfo
    query: (handle: number, sql: unknown, params?: unknown) => SqlResult
    tables: (handle: number) => string[]
    /** Für Python/Java/C#: Anfrage und Antwort als JSON-Text, SQL-Fehler als `{ "sqlError": … }` statt Ausnahme */
    json: (request: string) => string
  }
}

/**
 * Roboter-API für JS/TS/Python/Java/C# – dieselben Befehle wie in Klonk-Script, aber objektorientiert:
 * jede Figur ist ein eigenes Objekt (`new Klonk("Klara").step()`), nur englische Namen
 * (die Schlüsselwörter dieser Sprachen sind ohnehin englisch).
 */
export function createApi(host: ApiHost): RobotApi {
  const delay = () => host.sleep(-1)
  const w = () => host.world
  const run = <T>(fn: () => T): T => {
    try {
      return fn()
    }
    catch (error) {
      const apiError = error instanceof WorldError
        ? new ApiError('world', { worldCode: error.code, ...error.params })
        : error instanceof ApiError ? error : null
      if (apiError) {
        host.onError?.(apiError)
        throw apiError
      }
      throw error
    }
  }

  function methods(id: string): Record<string, (...args: never[]) => unknown> {
    const act = (fn: () => void, command: RobotCommand) => {
      fn()
      host.command(command)
      delay()
    }
    return {
      step: (count: number = 1) => {
        if (!Number.isInteger(count) || count < 0) throw new ApiError('expected_count', { value: String(count) })
        for (let i = 0; i < count; i++) act(() => w().step(id), { name: 'step', id })
      },
      turnLeft: () => act(() => w().turnLeft(id), { name: 'turnLeft', id }),
      turnRight: () => act(() => w().turnRight(id), { name: 'turnRight', id }),
      placeBrick: (c: unknown = 'red') => {
        const brick = color(c, BRICK_COLORS)
        act(() => w().placeBrick(id, brick), { name: 'placeBrick', id, color: brick })
      },
      pickBrick: () => act(() => w().pickBrick(id), { name: 'pickBrick', id }),
      setMark: (c: unknown = 'yellow') => {
        const mark = color(c, MARK_COLORS)
        act(() => w().setMark(id, mark), { name: 'setMark', id, color: mark })
      },
      removeMark: () => act(() => w().removeMark(id), { name: 'removeMark', id }),
      isWall: () => w().isWall(id),
      isBrick: (c?: unknown) => w().isBrick(id, c === undefined || c === null ? undefined : color(c, BRICK_COLORS)),
      isMark: (c?: unknown) => w().isMark(id, c === undefined || c === null ? undefined : color(c, MARK_COLORS)),
      isFacingNorth: () => w().getCharacter(id).direction === 'north',
      isFacingEast: () => w().getCharacter(id).direction === 'east',
      isFacingSouth: () => w().getCharacter(id).direction === 'south',
      isFacingWest: () => w().getCharacter(id).direction === 'west',
      brickCount: () => w().bricksInFront(id),
      positionX: () => w().getCharacter(id).x + 1,
      positionY: () => w().getCharacter(id).z + 1,
    }
  }

  const robots = new Map<string, RobotHandle>()
  let lastUsed: string | undefined
  function robot(name?: unknown): RobotHandle {
    return run(() => {
      if (name !== undefined && name !== null && typeof name !== 'string' && typeof name !== 'number') throw new ApiError('expected_robot_name', { value: String(name) })
      const { id } = w().findCharacter(name ?? undefined)
      let handle = robots.get(id)
      if (!handle) {
        handle = { name: id } as RobotHandle
        for (const [method, fn] of Object.entries(methods(id))) {
          (handle as Record<string, unknown>)[method] = (...args: never[]) => run(() => fn(...args))
        }
        robots.set(id, Object.freeze(handle))
      }
      lastUsed = id
      return handle
    })
  }

  function create(name: unknown, look?: unknown, x?: unknown, y?: unknown): RobotHandle {
    const character = run(() => {
      if (typeof name !== 'string') throw new ApiError('expected_robot_name', { value: String(name) })
      const position = (value: unknown) => (value === undefined || value === null || value === -1 ? undefined : Number(value) - 1)
      return w().spawnCharacter(name, resolveLook(look, host.designs), { near: lastUsed, x: position(x), z: position(y), maxCharacters: host.maxCharacters })
    })
    host.command({ name: 'createCharacter', id: character.id, character })
    delay()
    return robot(character.id)
  }

  const globals: Record<string, unknown> = {
    wait: (seconds = 1) => host.sleep(Math.max(0, Math.min(Number(seconds) || 0, 60)) * 1000),
  }
  for (const c of BRICK_COLORS) globals[c] = c

  // Designs als JSON laden und speichern (Lizenz) – bearbeitbar mit den JSON-/YAML-/XML-Werkzeugen der Sprache
  const designKey = (name: unknown) => Object.keys(host.designs ?? {}).find(k => k.toLowerCase() === String(name).trim().toLowerCase())
  globals.loadDesign = (name: unknown) => run(() => {
    if (!host.designs) throw new WorldError('design_license')
    const key = designKey(name)
    if (!key) throw new WorldError('unknown_design', { name: String(name) })
    return JSON.stringify(host.designs[key], null, 2)
  })
  globals.saveDesign = (name: unknown, design: unknown) => run(() => {
    if (!host.designs) throw new WorldError('design_license')
    if (!host.saveDesign) throw new ApiError('design_no_project')
    const text = String(name ?? '').trim()
    if (!/^[\p{L}\p{N}_ -]{1,64}$/u.test(text)) throw new ApiError('design_name', { name: text })
    let data: unknown = design
    if (typeof design === 'string') {
      try {
        data = JSON.parse(design)
      }
      catch {
        throw new WorldError('invalid_design', { reason: 'json' })
      }
    }
    const parsed = parseDesign(data)
    host.designs[designKey(text) ?? text] = parsed
    host.saveDesign(text, parsed)
  })

  // Datenbanken
  const fail = (error: ApiError): never => {
    host.onError?.(error)
    throw error
  }
  const dbCall = (request: DbRequest) => {
    const response = host.database ? host.database(request) : { ok: false as const, code: 'db_unavailable', params: {} }
    if (response.ok) return response
    return fail(response.code === 'sql_error' ? new DatabaseError(String(response.params.message ?? '')) : new ApiError(response.code, response.params))
  }
  const info = (response: DbResponse & { ok: true }): DatabaseInfo => ({ handle: response.handle!, name: response.name!, engine: response.engine! })
  const toParams = (params: unknown): SqlValue[] => {
    if (params === undefined || params === null) return []
    const values = Array.isArray(params) ? params : [params]
    return values.map(v => (v === undefined ? null : typeof v === 'bigint' ? Number(v) : v instanceof Date ? v.toISOString() : v) as SqlValue)
  }
  const db: RobotApi['db'] = {
    open: (name) => {
      if (typeof name !== 'string' || !name.trim()) fail(new ApiError('db_name', { value: String(name) }))
      return info(dbCall({ op: 'open', name: (name as string).trim() }))
    },
    memory: (engine = 'sqlite') => {
      const value = String(engine ?? 'sqlite').toLowerCase()
      const name = (value === 'postgresql' || value === 'pglite' ? 'postgres' : value) as SqlEngineName
      if (!SQL_ENGINES.includes(name)) fail(new ApiError('db_engine', { value: String(engine) }))
      return info(dbCall({ op: 'memory', engine: name }))
    },
    query: (handle, sql, params) => {
      if (typeof sql !== 'string') fail(new ApiError('db_sql', { value: String(sql) }))
      return dbCall({ op: 'query', handle, sql: sql as string, params: toParams(params) }).result!
    },
    tables: handle => dbCall({ op: 'tables', handle }).tables!,
    json: (request) => {
      const parsed = JSON.parse(request) as { op: string, name?: string, engine?: string, handle?: number, sql?: string, params?: unknown[] }
      try {
        switch (parsed.op) {
          case 'open': return JSON.stringify(db.open(parsed.name))
          case 'memory': return JSON.stringify(db.memory(parsed.engine))
          case 'query': return JSON.stringify(db.query(parsed.handle!, parsed.sql, parsed.params ?? []))
          case 'tables': return JSON.stringify(db.tables(parsed.handle!))
          default: throw new Error(`unknown database request ${parsed.op}`)
        }
      }
      catch (error) {
        if (error instanceof DatabaseError) return JSON.stringify({ sqlError: error.message })
        throw error
      }
    },
  }

  /** Ausgabe wie Klonk-Script (für console.log in JS) */
  const print = (...values: unknown[]) => host.print(values.map(v => display(v)).join(' '))

  return { globals, print, robot, create, names: () => w().getCharacters().map(c => c.id), db }
}

/** Ergebniszeilen als Objekte (Spaltenname ⇒ Wert) */
export function rowObjects(result: SqlResult) {
  return result.rows.map(row => Object.fromEntries(result.columns.map((column, i) => [column, row[i] ?? null])))
}

/**
 * Klasse `Database` für JS/TS: `Database.open("schule")` (Projektdatei schule.sqlite.sql bzw. schule.postgres.sql),
 * `Database.memory("postgres")`; `query` liefert Objekte, `execute` die Zahl geänderter Zeilen.
 */
export function createDatabaseClass(api: RobotApi) {
  const infos = new WeakMap<object, DatabaseInfo>()
  const of = (db: object) => {
    const found = infos.get(db)
    if (!found) throw new ApiError('expected_database')
    return found
  }
  class Database {
    declare readonly name: string
    declare readonly engine: SqlEngineName
    private constructor(info: DatabaseInfo) {
      infos.set(this, info)
      Object.defineProperty(this, 'name', { value: info.name, enumerable: true })
      Object.defineProperty(this, 'engine', { value: info.engine, enumerable: true })
    }

    /** Datenbank des Projekts öffnen (Dateiname ohne Endung) */
    static open(name: string) {
      return new Database(api.db.open(name))
    }

    /** Neue, leere Datenbank nur für diesen Lauf: "sqlite" (Standard) oder "postgres" */
    static memory(engine: SqlEngineName = 'sqlite') {
      return new Database(api.db.memory(engine))
    }

    /** Abfrage ⇒ Zeilen als Objekte */
    query(sql: string, params?: unknown[]) {
      return rowObjects(api.db.query(of(this).handle, sql, params))
    }

    /** Erste Zeile oder null */
    queryOne(sql: string, params?: unknown[]) {
      return this.query(sql, params)[0] ?? null
    }

    /** Ändernde Anweisung (INSERT, UPDATE, DELETE, CREATE …) ⇒ Zahl geänderter Zeilen */
    execute(sql: string, params?: unknown[]) {
      return api.db.query(of(this).handle, sql, params).changes ?? 0
    }

    /** Namen der Tabellen und Sichten */
    tables() {
      return api.db.tables(of(this).handle)
    }

    [ROBOT_DISPLAY]() {
      return `Database(${JSON.stringify(this.name)}, ${this.engine})`
    }
  }
  return Database
}

/** Darstellung einer Figur in Ausgabe und Variablenansicht */
export const ROBOT_DISPLAY = Symbol.for('klonk.display')

/**
 * Klasse `Klonk` für JS/TS: `new Klonk()` (erste Figur), `new Klonk("Klara")`, `new Klonk(2)`, `Klonk.all()`.
 * Methoden heißen wie die Befehle (`step`, `turnLeft`, `isWall` …).
 */
export function createKlonkClass(api: RobotApi) {
  const handles = new WeakMap<object, RobotHandle>()
  class Klonk {
    declare readonly name: string
    constructor(name?: string | number) {
      const handle = api.robot(name)
      handles.set(this, handle)
      Object.defineProperty(this, 'name', { value: handle.name, enumerable: true })
    }

    static all() {
      return api.names().map(name => new Klonk(name))
    }

    /** Neue Figur erstellen: `Klonk.create("Kim", "female", 3, 1)` */
    static create(name: string, look?: string, x?: number, y?: number) {
      return new Klonk(api.create(name, look, x, y).name)
    }

    [ROBOT_DISPLAY]() {
      return `Klonk(${JSON.stringify(this.name)})`
    }
  }
  for (const method of ROBOT_METHODS) {
    Object.defineProperty(Klonk.prototype, method, {
      value: function (this: object, ...args: unknown[]) {
        const handle = handles.get(this)
        if (!handle) throw new ApiError('expected_robot')
        return handle[method]!(...args)
      },
      writable: true,
      configurable: true,
    })
  }
  return Klonk
}
