import { DatabaseClient, SqlError, type DatabaseSession, type DbRequest, type DbResponse, type SqlEngineName, type SqlResult, type SqlTable, type WorldSqlLanguage } from '@klonk/runtime'
import DbWorker from '@klonk/runtime/db-worker?worker'
import type { WorldData } from '@klonk/world'
import type { Project } from '~/utils/project-fs'
import { DATABASE_EXTENSIONS, databaseEngine, databaseName } from '~/utils/project-fs'

/** Geöffnete Projektdatenbank: Sitzung im Datenbank-Worker + zuletzt gelesener/geschriebener Dateiinhalt */
type Entry = { session: DatabaseSession, project: Project, path: string, text: string, timer?: ReturnType<typeof setTimeout>, saving?: Promise<void> }

// Zustand außerhalb von Komponenten: eine Sitzung je Datenbankdatei, gemeinsam für Editor und Programme
let client: DatabaseClient | undefined
const entries = new Map<string, Promise<Entry>>()
let owner: Project | null = null
/** Zählt Änderungen (Tabellenansichten laden dann neu) */
const version = ref(0)
/** Datenbanken des laufenden Programms: Handle ⇒ Sitzung (+ Pfad bei Projektdatenbanken) */
const runHandles = new Map<number, { session: DatabaseSession, path?: string }>()

const SAVE_DELAY_MS = 600
/** Zeilen in der SQL-Konsole (mehr zeigt die Tabelle ohnehin nicht sinnvoll) */
export const CONSOLE_ROWS = 1000

/** Umbenannte/gelöschte Datenbankdateien vergessen (ohne zu sichern – sonst entstünde die Datei neu) */
let watching = false
function watchFiles(project: Ref<Project | null>, files: Ref<{ path: string }[]>, forget: (path: string, save: boolean) => Promise<void>) {
  if (watching) return
  watching = true
  effectScope(true).run(() => watch(files, (list) => {
    // Projektwechsel räumt ensureOwner() auf (mit Sichern)
    if (project.value !== owner) return
    const existing = new Set(list.map(f => f.path))
    for (const path of entries.keys()) if (!existing.has(path)) void forget(path, false)
  }))
}

/** Welt als Text zum Vergleichen (Reihenfolge von Feldern, Figuren und Schlüsseln egal) */
function canonical(data: WorldData) {
  const cells = data.cells
    .filter(c => c.bricks?.length || c.mark || c.block)
    .map(c => [c.x, c.z, c.bricks ?? [], c.mark ?? null, !!c.block] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const characters = data.characters
    .map(c => [c.id, c.x, c.z, c.direction, c.model, c.design ?? null] as const)
    .sort((a, b) => a[0].localeCompare(b[0]))
  return JSON.stringify([data.size, cells, characters])
}

function db() {
  client ??= new DatabaseClient(() => new DbWorker())
  return client
}

/**
 * Könnte das SQL die Datenbank geändert haben? Anweisungen ohne Ergebnisspalten (INSERT, DDL …) sicher; dazu ändernde
 * Schlüsselwörter im Text (z. B. `INSERT … RETURNING` liefert Spalten). Zu viel ist harmlos: gleicher Dump wird nicht geschrieben.
 */
const CHANGING = /\b(insert|update|delete|create|drop|alter|truncate|replace|merge|rename|comment|grant|revoke)\b/i
const modifies = (results: SqlResult[], sql = '') => results.some(r => r.columns.length === 0) || CHANGING.test(sql)

/**
 * Datenbanken im Browser (SQLite und PostgreSQL/PGlite im eigenen Worker): Projektdatenbanken werden bei Bedarf
 * aus ihrer SQL-Datei geladen und nach Änderungen automatisch wieder als SQL gesichert. Programme greifen über
 * `answer` zu (siehe ProgramRunner.onDatabase), die Welt lässt sich als Datenbank abfragen und ändern.
 */
export function useDatabases() {
  const proj = useProject()
  const { locale } = useI18n()
  const worldLanguage = (): WorldSqlLanguage => (locale.value === 'en' ? 'en' : 'de')
  watchFiles(proj.project, proj.files, forget)

  /** Beim Projektwechsel alle Sitzungen schließen */
  async function ensureOwner() {
    if (proj.project.value === owner) return
    await closeAll()
    owner = proj.project.value
  }

  async function open(path: string): Promise<Entry> {
    await ensureOwner()
    const project = proj.project.value
    if (!project) throw new SqlError('no_project')
    const cached = entries.get(path)
    if (cached) {
      const entry = await cached.catch(() => null)
      if (entry) {
        // Datei inzwischen anders (z. B. von einem anderen Gerät über die Cloud) ⇒ neu laden, sofern hier nichts aussteht
        const text = await project.read(path).catch(() => entry.text)
        if (text === entry.text || entry.timer || entry.saving) return entry
        await forget(path, false)
      }
      else entries.delete(path)
    }
    const engine = databaseEngine(path)
    if (!engine) throw new SqlError('not_a_database')
    const loading = (async () => {
      const text = await project.read(path)
      const session = await db().open(engine, text)
      return { session, project, path, text }
    })()
    entries.set(path, loading)
    loading.catch(() => entries.delete(path))
    return loading
  }

  /** Nach Änderungen sichern (verzögert, damit Folgen von Anweisungen zusammen gespeichert werden) */
  function scheduleSave(entry: Entry) {
    clearTimeout(entry.timer)
    entry.timer = setTimeout(() => void save(entry), SAVE_DELAY_MS)
    version.value++
  }

  async function save(entry: Entry) {
    clearTimeout(entry.timer)
    entry.timer = undefined
    const previous = entry.saving
    entry.saving = (async () => {
      await previous
      const current = proj.project.value === entry.project
      if (current && proj.readOnly.value) return
      const text = await entry.session.dump()
      if (text === entry.text) return
      entry.text = text
      // Projekt inzwischen gewechselt ⇒ direkt in die Datei des alten Projekts
      if (current) await proj.writeFile(entry.path, text)
      else await entry.project.write(entry.path, text)
    })().finally(() => {
      entry.saving = undefined
    })
    await entry.saving
  }

  /** Ausstehende Sicherungen sofort schreiben (z. B. vor dem Schließen des Projekts) */
  async function flush() {
    for (const loading of entries.values()) {
      const entry = await loading.catch(() => null)
      if (entry?.timer) await save(entry)
      else await entry?.saving
    }
  }

  async function forget(path: string, saveFirst = true) {
    const loading = entries.get(path)
    entries.delete(path)
    const entry = await loading?.catch(() => null)
    if (!entry) return
    if (saveFirst && entry.timer) await save(entry).catch(() => {})
    clearTimeout(entry.timer)
    await entry.saving?.catch(() => {})
    await entry.session.close().catch(() => {})
  }

  async function closeAll() {
    for (const path of [...entries.keys()]) await forget(path)
  }

  /** SQL-Skript (mehrere Anweisungen) auf einer Projektdatenbank ausführen */
  async function run(path: string, sql: string) {
    const entry = await open(path)
    try {
      const results = await entry.session.script(sql, CONSOLE_ROWS)
      if (modifies(results, sql)) scheduleSave(entry)
      return results
    }
    catch (error) {
      // Bis zum Fehler Ausgeführtes bleibt (SQLite) – auch das sichern
      if (error instanceof SqlError && modifies(error.results, sql)) scheduleSave(entry)
      throw error
    }
  }

  async function tables(path: string): Promise<SqlTable[]> {
    return (await open(path)).session.tables()
  }

  /** Welt als Datenbank: Tabellen aus der Welt, SQL ausführen, bei Änderungen die neue Welt zurückgeben */
  async function runWorld(engine: SqlEngineName, data: WorldData, sql: string): Promise<{ results: SqlResult[], world: WorldData | null }> {
    const session = await db().openWorld(engine, data, worldLanguage())
    try {
      let results: SqlResult[]
      try {
        results = await session.script(sql, CONSOLE_ROWS)
      }
      catch (error) {
        // Bis zum Fehler Geändertes trotzdem übernehmen (wie in Projektdatenbanken)
        if (error instanceof SqlError && modifies(error.results, sql)) {
          const world = await session.readWorld(data, worldLanguage()).catch(() => null)
          throw Object.assign(error, { world })
        }
        throw error
      }
      const world = modifies(results, sql) ? await session.readWorld(data, worldLanguage()) : null
      // Nur melden, was sich wirklich geändert hat (Schlüsselwörter können auch in Texten stehen)
      return { results, world: world && canonical(world) !== canonical(data) ? world : null }
    }
    finally {
      void session.close().catch(() => {})
    }
  }

  /** Schema der Welt-Tabellen (für Vorschläge und die Tabellenübersicht) */
  async function worldTables(engine: SqlEngineName, data: WorldData) {
    const session = await db().openWorld(engine, data, worldLanguage())
    try {
      return await session.tables()
    }
    finally {
      void session.close().catch(() => {})
    }
  }

  /** Neue Datenbankdatei aus einer SQLite-Datei (`.db`, `.sqlite`) – Inhalt wird zu SQL-Text */
  async function importSqlite(file: File, folder?: string) {
    const session = await db().open('sqlite', new Uint8Array(await file.arrayBuffer()))
    try {
      const text = await session.dump()
      const base = file.name.replace(/\.(db|sqlite3?|db3)$/i, '').replace(/[/\\:*?"<>|]/g, '_') || 'import'
      let name = `${base}${DATABASE_EXTENSIONS.sqlite}`
      for (let i = 2; proj.files.value.some(f => f.path === (folder ? `${folder}/${name}` : name)); i++) name = `${base} ${i}${DATABASE_EXTENSIONS.sqlite}`
      return await proj.create(folder ? `${folder}/${name}` : name, 'database', text)
    }
    finally {
      void session.close().catch(() => {})
    }
  }

  /** SQLite-Datenbank als Datei herunterladen (z. B. für DB Browser for SQLite) */
  async function exportSqlite(path: string) {
    const entry = await open(path)
    const bytes = await entry.session.exportFile()
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.sqlite3' }))
    const link = Object.assign(document.createElement('a'), { href: url, download: `${databaseName(path)}.db` })
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // ---------------------------------------------------------------------------
  // Programme (Database.open/memory, query …)

  /** Vor jedem Lauf: temporäre Datenbanken des letzten Laufs schließen */
  function beginRun() {
    for (const { session, path } of runHandles.values()) if (!path) void session.close().catch(() => {})
    runHandles.clear()
  }

  async function answer(request: DbRequest): Promise<DbResponse> {
    try {
      switch (request.op) {
        case 'open': {
          if (!proj.project.value) return { ok: false, code: 'db_no_project', params: { name: request.name } }
          const wanted = request.name.toLowerCase()
          const file = proj.databaseFiles.value.find(f => databaseName(f.path).toLowerCase() === wanted)
          if (!file) return { ok: false, code: 'db_not_found', params: { name: request.name } }
          const entry = await open(file.path)
          runHandles.set(entry.session.handle, { session: entry.session, path: file.path })
          return { ok: true, handle: entry.session.handle, name: databaseName(file.path), engine: entry.session.engine }
        }
        case 'memory': {
          const session = await db().open(request.engine)
          runHandles.set(session.handle, { session })
          return { ok: true, handle: session.handle, name: 'memory', engine: session.engine }
        }
        case 'query': {
          const found = runHandles.get(request.handle)
          if (!found) return { ok: false, code: 'db_closed', params: {} }
          const result = await found.session.query(request.sql, request.params)
          if (found.path && modifies([result], request.sql)) {
            const entry = await entries.get(found.path)?.catch(() => null)
            if (entry) scheduleSave(entry)
          }
          return { ok: true, result }
        }
        case 'tables': {
          const found = runHandles.get(request.handle)
          if (!found) return { ok: false, code: 'db_closed', params: {} }
          return { ok: true, tables: (await found.session.tables()).map(t => t.name) }
        }
      }
    }
    catch (error) {
      if (error instanceof SqlError) return { ok: false, code: 'sql_error', params: { message: error.message } }
      throw error
    }
  }

  return { version, run, tables, runWorld, worldTables, importSqlite, exportSqlite, flush, closeAll, forget, beginRun, answer }
}
