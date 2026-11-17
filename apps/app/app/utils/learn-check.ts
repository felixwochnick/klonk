import { collectTables, compareOutcome, databaseSql, expectedOutcomes, isCodeLanguage, isCustomModuleId, LEARN_EXTENSIONS, localize, missingCodeConstructs, missingConstructs, missingSqlConstructs, referenceSolution, scenarioCount, sqlOutcome, type CheckFailure, type Construct, type LearnLanguage, type LearnModule, type LearnSqlSession, type LearnTask, type Outcome } from '@klonk/learn'
import { DatabaseClient, ProgramRunner, SqlError, WorldSqlError, type DatabaseSession, type DbRequest, type DbResponse, type RunError, type RunLanguage, type SqlResult, type SqlTable } from '@klonk/runtime'
import RunnerWorker from '@klonk/runtime/worker?worker'
import DbWorker from '@klonk/runtime/db-worker?worker'
import { KlonkError } from '@klonk/klonk-script'
import { World, type WorldData } from '@klonk/world'
import { outlineOf } from '~/utils/diagrams'

/** Ergebnis der Prüfung einer Aufgabe – `world` = Index der Startsituation, in der es scheitert */
export type LearnCheckResult
  = | { status: 'solved' }
    | { status: 'syntax', error: RunError }
    | { status: 'missing', constructs: Construct[] }
    | { status: 'failed', world: number, failure: CheckFailure }
    | { status: 'error', world: number, error: RunError }
    | { status: 'timeout', world: number }

/** Startwelt einer Startsituation (SQL-Aufgaben ohne Welt: keine; Programme ohne eigene: die erste) */
export const scenarioWorld = (task: LearnTask, scenario: number): WorldData | null => task.worlds[scenario] ?? task.worlds[0] ?? null

// Eigener Datenbank-Worker für die Lernansicht (Projektdatenbanken der IDE bleiben unberührt)
let client: DatabaseClient | undefined
const learnDb = () => (client ??= new DatabaseClient(() => new DbWorker()))

/**
 * Datenbanken einer Aufgabe während eines Laufs: jeder Lauf beginnt mit einer frischen Kopie (Daten der
 * Startsituation), mehrfaches `Database.open` liefert dieselbe. Beantwortet die Anfragen der Programme
 * (`ProgramRunner.onDatabase`) wie `useDatabases().answer` in der IDE.
 */
export class TaskDatabases {
  private named = new Map<string, Promise<DatabaseSession>>()
  private handles = new Map<number, DatabaseSession>()
  private temporary: DatabaseSession[] = []

  constructor(private task: LearnTask, private scenario: number, private lang: 'de' | 'en') {}

  private open(name: string) {
    const found = (this.task.databases ?? []).find(d => localize(d.name, this.lang).toLowerCase() === name.toLowerCase())
    if (!found) return null
    const key = localize(found.name, this.lang)
    let session = this.named.get(key)
    if (!session) this.named.set(key, session = learnDb().open('sqlite', databaseSql(found, this.scenario, this.lang)))
    return session.then(s => ({ session: s, name: key }))
  }

  async answer(request: DbRequest): Promise<DbResponse> {
    try {
      switch (request.op) {
        case 'open': {
          const opened = await this.open(request.name)
          if (!opened) return { ok: false, code: 'db_not_found', params: { name: request.name } }
          this.handles.set(opened.session.handle, opened.session)
          return { ok: true, handle: opened.session.handle, name: opened.name, engine: 'sqlite' }
        }
        case 'memory': {
          const session = await learnDb().open(request.engine)
          this.temporary.push(session)
          this.handles.set(session.handle, session)
          return { ok: true, handle: session.handle, name: 'memory', engine: session.engine }
        }
        case 'query': {
          const session = this.handles.get(request.handle)
          if (!session) return { ok: false, code: 'db_closed', params: {} }
          return { ok: true, result: await session.query(request.sql, request.params) }
        }
        case 'tables': {
          const session = this.handles.get(request.handle)
          if (!session) return { ok: false, code: 'db_closed', params: {} }
          return { ok: true, tables: (await session.tables()).map(t => t.name) }
        }
      }
    }
    catch (error) {
      if (error instanceof SqlError) return { ok: false, code: 'sql_error', params: { message: error.message } }
      throw error
    }
  }

  /** Alle Aufgabendatenbanken – nicht geöffnete im Anfangszustand (für die geprüften Tabellen) */
  async all(): Promise<LearnSqlSession[]> {
    for (const db of this.task.databases ?? []) await this.open(localize(db.name, this.lang))
    return Promise.all(this.named.values())
  }

  close() {
    for (const session of [...this.named.values()]) void session.then(s => s.close()).catch(() => {})
    for (const session of this.temporary) void session.close().catch(() => {})
  }
}

type HeadlessResult = { outcome: Outcome } | { error: RunError } | { timeout: true }

/** Zeitlimit je Sprache – Python, Java und C# laden erst ihre Laufzeit bzw. übersetzen */
const TIMEOUTS: Record<RunLanguage, number> = { klonk: 5000, javascript: 5000, typescript: 5000, python: 30000, java: 30000, csharp: 30000 }

export type HeadlessOptions = { lang: 'de' | 'en', maxCharacters: number }

/** Höchstzahl der Figuren: Lizenz, aber mindestens so viele, wie die Aufgabe braucht */
export const taskMaxCharacters = (task: LearnTask, license: number) =>
  Math.max(license, task.characters ?? 1, ...task.worlds.map(w => w.characters.length))

/** Führt ein Programm ohne Animation im Worker aus (Endlosschleifen ⇒ Zeitlimit), mit frischen Aufgabendatenbanken */
function runHeadless(task: LearnTask, language: RunLanguage, source: string, scenario: number, options: HeadlessOptions): Promise<HeadlessResult> {
  const start = scenarioWorld(task, scenario) ?? World.empty().toJSON()
  return new Promise((resolve) => {
    const world = new World(start)
    const databases = new TaskDatabases(task, scenario, options.lang)
    let done = false
    const runner = new ProgramRunner(() => new RunnerWorker(), (snapshot) => {
      if (snapshot.state === 'done') {
        const output = snapshot.output
        void databases.all().then(sessions => collectTables(task, options.lang, sessions))
          .then(tables => finish({ outcome: { world: world.toJSON(), output, tables } }), error => finish({ error: { code: 'internal', params: { message: String(error) } } }))
      }
      else if (snapshot.state === 'error' && snapshot.error) finish({ error: snapshot.error })
    })
    runner.onDatabase = request => databases.answer(request)
    function finish(result: HeadlessResult) {
      if (done) return
      done = true
      clearTimeout(timer)
      runner.dispose()
      databases.close()
      resolve(result)
    }
    const timer = setTimeout(() => finish({ timeout: true }), TIMEOUTS[language])
    runner.run(world, { language, source, path: `Program.${LEARN_EXTENSIONS[language]}`, delay: 0, breakpoints: [], allowImports: false, files: {}, maxCharacters: taskMaxCharacters(task, options.maxCharacters) })
  })
}

/** Fehler eines SQL-Laufs als RunError (Zeile im Skript, Welt-Tabellen mit eigenem Code) */
function sqlRunError(error: unknown): RunError {
  if (error instanceof WorldSqlError) return { code: 'world_sql', params: { ...error.params, worldCode: error.code } }
  if (error instanceof SqlError) {
    const line = error.line ?? 0
    return { code: 'sql_error', params: { message: error.message }, range: line ? { line, column: 1, endLine: line, endColumn: 1 } : undefined }
  }
  return { code: 'internal', params: { message: String((error as Error)?.message ?? error) } }
}

export type SqlRun = { outcome: Outcome, results: SqlResult[] } | { error: RunError, results: SqlResult[] }

/** SQL-Aufgabe in einer Startsituation ausführen: frische Datenbank bzw. Welt-Tabellen, alle Ergebnisse für die Anzeige */
export async function runSqlTask(task: LearnTask, sql: string, scenario: number, lang: 'de' | 'en'): Promise<SqlRun> {
  const start = scenarioWorld(task, scenario)
  const session = task.worldDatabase && start
    ? await learnDb().openWorld('sqlite', start, lang)
    : await learnDb().open('sqlite', databaseSql(task.databases![0]!, scenario, lang))
  let results: SqlResult[] = []
  const capture: LearnSqlSession = {
    script: async text => (results = await session.script(text)),
    query: text => session.query(text),
    tables: () => session.tables(),
  }
  try {
    return { outcome: await sqlOutcome(task, lang, capture, sql, start, () => session.readWorld(start!, lang)), results }
  }
  catch (error) {
    return { error: sqlRunError(error), results: error instanceof SqlError ? error.results : results }
  }
  finally {
    void session.close().catch(() => {})
  }
}

/** Sprache, in der der Runner die Musterlösung bzw. das Programm ausführt (Blöcke ⇒ Klonk-Script) */
const runLanguage = (language: LearnLanguage): RunLanguage => (language === 'blocks' ? 'klonk' : language as RunLanguage)

const expectedCache = new Map<string, Promise<Outcome[]>>()

/** Warum sich der Zielzustand nicht berechnen ließ (Fehler der Musterlösung – vor allem beim Erstellen eigener Module) */
export class ExpectedError extends Error {
  constructor(public scenario: number, public error: RunError | null, public timeout = false) {
    super('learn_expected')
  }
}

/**
 * Zielzustände: Ergebnis der Musterlösung in jeder Startsituation – Reihe E über den Interpreter, F/A über die
 * Referenzlösung (JavaScript bzw. bei eigenen Modulen die erste vorhandene Sprache) im Worker, S über die SQL-Lösung
 * der UI-Sprache (je Aufgabe, Stand des Moduls und Sprache einmal berechnet). Fehler ⇒ `ExpectedError`.
 */
export function computeExpected(module: LearnModule, task: LearnTask, options: HeadlessOptions): Promise<Outcome[]> {
  const key = `${module.id}@${module.revision ?? ''}/${task.id}/${options.lang}`
  let cached = expectedCache.get(key)
  if (!cached) {
    cached = (async () => {
      // Eingebaute Lösungen der Reihe E sind geprüft ⇒ direkt im Interpreter; eigene laufen wie Programme der Lernenden im
      // Worker mit Zeitlimit (eine Endlosschleife in der Musterlösung hielte sonst die Seite an)
      if (module.track === 'basics' && !isCustomModuleId(module.id)) return expectedOutcomes(task)
      const reference: { language: RunLanguage, source: string } | null = module.track === 'basics'
        ? { language: 'klonk', source: task.solution?.de ?? '' }
        : referenceSolution(task.solutions)
      const outcomes: Outcome[] = []
      for (let i = 0; i < scenarioCount(task); i++) {
        if (module.track === 'sql') {
          const run = await runSqlTask(task, task.solution?.[options.lang] ?? '', i, options.lang)
          if ('error' in run) throw new ExpectedError(i, run.error)
          outcomes.push(run.outcome)
        }
        else {
          if (!reference) throw new ExpectedError(i, null)
          const run = await runHeadless(task, reference.language, reference.source, i, { ...options, maxCharacters: Infinity })
          if (!('outcome' in run)) throw new ExpectedError(i, 'error' in run ? run.error : null, 'timeout' in run)
          outcomes.push(run.outcome)
        }
      }
      return outcomes
    })()
    expectedCache.set(key, cached)
    cached.catch(() => expectedCache.delete(key))
  }
  return cached
}

/** Verlangte Bausteine, die fehlen (Klonk-Script am Syntaxbaum, Programmiersprachen an der Auswertung für Diagramme, SQL am Text) */
async function missing(language: LearnLanguage, source: string, requires: Construct[] | undefined) {
  if (!requires?.length) return []
  if (language === 'sql') return missingSqlConstructs(source, requires)
  if (isCodeLanguage(language)) {
    const outline = await outlineOf(language, source).catch(() => null)
    return outline ? missingCodeConstructs(outline, requires) : []
  }
  return missingConstructs(source, requires)
}

/** Prüft ein Programm (Klonk-Script auch aus Blöcken, Programmiersprache oder SQL) in allen Startsituationen der Aufgabe */
export async function checkTask(task: LearnTask, expected: Outcome[], language: LearnLanguage, source: string, options: HeadlessOptions): Promise<LearnCheckResult> {
  try {
    const constructs = await missing(language, source, task.requires)
    if (constructs.length) return { status: 'missing', constructs }
  }
  catch (error) {
    if (error instanceof KlonkError) return { status: 'syntax', error: { code: error.code, params: error.params, range: error.range } }
    throw error
  }
  for (const [i, want] of expected.entries()) {
    let outcome: Outcome
    if (language === 'sql') {
      const run = await runSqlTask(task, source, i, options.lang)
      if ('error' in run) return { status: 'error', world: i, error: run.error }
      outcome = run.outcome
    }
    else {
      const result = await runHeadless(task, runLanguage(language), source, i, options)
      if ('timeout' in result) return { status: 'timeout', world: i }
      if ('error' in result) return { status: 'error', world: i, error: result.error }
      outcome = result.outcome
    }
    const failure = compareOutcome(task.check, want, outcome)
    if (failure) return { status: 'failed', world: i, failure }
  }
  return { status: 'solved' }
}

export type ScenarioTables = { schema: SqlTable[], tables: { name: string, columns: string[], rows: unknown[][] }[] }

/** Tabellen der Aufgabendatenbank(en) einer Startsituation mit Inhalt (Ansicht „Datenbank“, Vorschläge im SQL-Editor) */
export async function scenarioTables(task: LearnTask, scenario: number, lang: 'de' | 'en', maxRows = 100): Promise<ScenarioTables> {
  const start = scenarioWorld(task, scenario)
  const sessions = task.worldDatabase && start
    ? [await learnDb().openWorld('sqlite', start, lang)]
    : await Promise.all((task.databases ?? []).map(db => learnDb().open('sqlite', databaseSql(db, scenario, lang))))
  try {
    const result: ScenarioTables = { schema: [], tables: [] }
    for (const session of sessions) {
      const schema = (await session.tables()).filter(t => t.kind === 'table')
      result.schema.push(...schema)
      for (const table of schema) {
        const rows = await session.query(`SELECT * FROM "${table.name.replace(/"/g, '""')}"`, [], maxRows)
        result.tables.push({ name: table.name, columns: rows.columns, rows: rows.rows })
      }
    }
    return result
  }
  finally {
    for (const session of sessions) void session.close().catch(() => {})
  }
}
