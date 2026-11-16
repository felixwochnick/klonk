import { readFileSync } from 'node:fs'
import { loadPyodide, type PyodideInterface } from 'pyodide'
import type { Database } from '@sqlite.org/sqlite-wasm'
import { World, type WorldData } from '@klonk/world'
import { javaOutline, javascriptOutline, pythonOutline, type Outline } from '@klonk/diagrams'
import { collectTables, databaseSql, localize, sqlOutcome, type CodeLanguage, type LearnSqlSession, type LearnTask, type Outcome } from '@klonk/learn'
import { createDbBuffer, writeDbResponse } from '../src/db/channel'
import { createSqlite, sqlite } from '../src/db/sqlite'
import { toSqlValue } from '../src/db/types'
import { sqlToWorld, worldToSql } from '../src/db/world'
import { createSharedState } from '../src/js/shared'
import { runJavaScript } from '../src/js/run'
import { runPython } from '../src/python/run'
import { runJava, type JavaToolchain } from '../src/java/run'
import { runCSharp } from '../src/csharp/run'
import { applyCommand } from '../src/runner'
import type { DbRequest, DbResponse, FromWorker, RunError } from '../src/protocol'

/**
 * Prüfstand der Lernmodule F, S und A in Node: Programme in allen Sprachen bzw. SQL echt ausführen und das Ergebnis wie
 * in der App (`apps/app/app/utils/learn-check.ts`) zusammenstellen. Datenbankanfragen der Programme beantwortet SQLite
 * synchron (in Node blockiert Atomics.wait den einzigen Thread, siehe db-host.ts).
 */

// Dieselbe sqlite-wasm-Instanz wie createSqlite (ein zweites Laden schlägt fehl)
const sqlite3 = sqlite

let pyodide: Promise<PyodideInterface> | undefined
/** Eine Pyodide-Instanz für alle Läufe – Module der Roboter-API aus dem letzten Lauf vergessen */
const loadPython = async () => {
  const instance = await (pyodide ??= loadPyodide())
  instance.runPython('import sys\nfor _m in ["_klonk_js", "klonk"]:\n    sys.modules.pop(_m, None)')
  return instance
}

const teavm = new URL('../teavm/', import.meta.url)
let java: Promise<JavaToolchain> | undefined
const loadJava = () => (java ??= (async () => {
  const { load } = await import(new URL('compiler.wasm-runtime.js', teavm).href)
  const bin = (name: string) => new Int8Array(readFileSync(new URL(name, teavm)))
  return { load, compiler: readFileSync(new URL('compiler.wasm', teavm)), sdk: bin('compile-classlib-teavm.bin'), classlib: bin('runtime-classlib-teavm.bin') } as JavaToolchain
})())

export const dotnetDir = new URL('../dotnet/', import.meta.url)
let dotnet: Promise<unknown> | undefined
const loadDotnet = () => (dotnet ??= import(new URL('dotnet.js', dotnetDir).href).then(m => m.dotnet.create())) as ReturnType<Parameters<typeof runCSharp>[2] & object>

/** SQLite-Datenbank (synchron) als `LearnSqlSession` für die Auswertung nach dem Lauf */
function session(db: Database): LearnSqlSession {
  const query = (sql: string) => {
    const stmt = db.prepare(sql)
    try {
      const columns = stmt.columnCount ? stmt.getColumnNames() : []
      const rows: unknown[][] = []
      while (stmt.step()) rows.push((stmt.get([]) as unknown[]).map(toSqlValue))
      return { columns, rows }
    }
    finally {
      stmt.finalize()
    }
  }
  return {
    script: async () => [],
    query: async sql => query(sql),
    tables: async () => (query(`SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).rows as string[][])
      .map(([name]) => ({ name: name!, columns: [] })),
  }
}

export type CodeRun = { outcome: Outcome } | { error: RunError }

/** Programm in einer Startsituation ausführen: Welt, Ausgabe und geprüfte Tabellen der Aufgabendatenbanken */
export async function runCode(task: LearnTask, language: CodeLanguage, source: string, scenario: number, lang: 'de' | 'en' = 'en'): Promise<CodeRun> {
  const capi = await sqlite3()
  const start: WorldData = task.worlds[scenario] ?? task.worlds[0]!
  // Je Lauf frische Datenbanken; mehrfaches `Database.open` liefert dieselbe
  const named = new Map<string, Database>()
  const handles = new Map<number, Database>()
  const openTask = (name: string) => {
    const found = (task.databases ?? []).find(d => localize(d.name, lang).toLowerCase() === name.toLowerCase())
    if (!found) return null
    const key = localize(found.name, lang)
    if (!named.has(key)) {
      const db = new capi.oo1.DB(':memory:', 'c')
      db.exec(databaseSql(found, scenario, lang))
      named.set(key, db)
    }
    return { db: named.get(key)!, name: key }
  }
  let next = 1
  const answer = (request: DbRequest): DbResponse => {
    switch (request.op) {
      case 'open': {
        const opened = openTask(request.name)
        if (!opened) return { ok: false, code: 'db_not_found', params: { name: request.name } }
        const handle = next++
        handles.set(handle, opened.db)
        return { ok: true, handle, name: opened.name, engine: 'sqlite' }
      }
      case 'memory': {
        const handle = next++
        handles.set(handle, new capi.oo1.DB(':memory:', 'c'))
        return { ok: true, handle, name: 'memory', engine: 'sqlite' }
      }
      case 'tables': {
        const db = handles.get(request.handle)!
        return { ok: true, tables: db.exec({ sql: `SELECT name FROM sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name`, rowMode: 0, returnValue: 'resultRows' }) as string[] }
      }
      case 'query': {
        const db = handles.get(request.handle)!
        try {
          const stmt = db.prepare(request.sql)
          try {
            if (request.params.length) stmt.bind(request.params as never)
            const columns = stmt.columnCount ? stmt.getColumnNames() : []
            const rows: unknown[][] = []
            while (stmt.step()) rows.push((stmt.get([]) as unknown[]).map(toSqlValue))
            return { ok: true, result: { columns, rows: rows as never, changes: columns.length ? null : db.changes() } }
          }
          finally {
            stmt.finalize()
          }
        }
        catch (error) {
          return { ok: false, code: 'sql_error', params: { message: String((error as Error).message).replace(/^SQLITE_\w+:\s*(sqlite3 result code \d+:\s*)?/, '') } }
        }
      }
    }
  }

  const world = new World(start)
  const output: string[] = []
  let error: RunError | undefined
  const database = createDbBuffer()
  const post = (message: FromWorker) => {
    if (message.type === 'db') writeDbResponse(database, answer(message.request))
    else if (message.type === 'command') applyCommand(world, message.command)
    else if (message.type === 'output' && !message.text.startsWith('MONO_WASM')) output.push(message.text)
    else if (message.type === 'error') error = message.error
  }
  const message = {
    type: 'run' as const,
    language,
    source,
    path: `Program.${{ python: 'py', java: 'java', javascript: 'js', typescript: 'ts', csharp: 'cs' }[language]}`,
    world: start,
    breakpoints: [],
    delay: 0,
    allowImports: false,
    files: {},
    // wie in der App: Lizenzgrenze der kostenlosen Version (1), aber mindestens so viele, wie die Aufgabe braucht
    maxCharacters: Math.max(task.characters ?? 1, start.characters.length),
    shared: createSharedState(),
    database,
  }
  if (language === 'python') await runPython(message, post, loadPython)
  else if (language === 'java') await runJava(message, post, loadJava)
  else if (language === 'csharp') await runCSharp(message, post, loadDotnet)
  else runJavaScript(message, post)
  if (error) return { error }

  // Geprüfte Tabellen: nicht geöffnete Datenbanken im Anfangszustand
  for (const db of task.databases ?? []) openTask(localize(db.name, lang))
  const tables = await collectTables(task, lang, [...named.values()].map(session))
  return { outcome: { world: world.toJSON(), output, tables } }
}

/** SQL-Aufgabe in einer Startsituation (frische Datenbank bzw. Welt-Tabellen in der UI-Sprache) */
export async function runSql(task: LearnTask, sql: string, scenario: number, lang: 'de' | 'en'): Promise<{ outcome: Outcome } | { error: string }> {
  const start = task.worlds[scenario] ?? null
  const engine = await createSqlite(task.worldDatabase ? worldToSql(start!, lang) : databaseSql(task.databases![0]!, scenario, lang))
  try {
    return { outcome: await sqlOutcome(task, lang, engine, sql, start, () => sqlToWorld(engine, start!, lang)) }
  }
  catch (error) {
    return { error: String((error as Error).message) }
  }
  finally {
    await engine.close()
  }
}

/** Auswertung für Diagramme (verlangte Bausteine): C# über Roslyn im .NET-Host, sonst @klonk/diagrams */
export async function outlineOf(language: CodeLanguage, source: string): Promise<Outline> {
  if (language === 'python') return pythonOutline(source)
  if (language === 'java') return javaOutline(source)
  if (language === 'csharp') {
    const host = await loadDotnet()
    const exports = await host.getAssemblyExports('Klonk.CSharp')
    return JSON.parse(exports.Host.Outline(source, []))
  }
  return javascriptOutline(source, undefined, language === 'typescript')
}
