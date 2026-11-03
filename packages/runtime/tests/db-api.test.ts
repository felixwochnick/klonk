import { existsSync, readFileSync } from 'node:fs'
import type { WorldData } from '@klonk/world'
import { loadPyodide } from 'pyodide'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDbBuffer } from '../src/db/channel'
import type { FromWorker, ToWorker } from '../src/protocol'
import { runCSharp } from '../src/csharp/run'
import { runJava } from '../src/java/run'
import { runJavaScript } from '../src/js/run'
import { createSharedState } from '../src/js/shared'
import { runPython } from '../src/python/run'
import { createTestDatabases } from './db-host'

// Datenbank-API in allen Objekt-Sprachen gegen echtes SQLite (synchron beantwortet, siehe db-host.ts)
const world: WorldData = { version: 1, size: { width: 5, depth: 5, height: 3 }, cells: [], characters: [{ id: 'k', model: 'male', x: 0, z: 0, direction: 'east' }] }
const messages: FromWorker[] = []
let postFor: Awaited<ReturnType<typeof createTestDatabases>>
beforeAll(async () => {
  postFor = await createTestDatabases()
})
beforeEach(() => {
  messages.length = 0
})

const message = (language: Extract<ToWorker, { type: 'run' }>['language'], source: string): Extract<ToWorker, { type: 'run' }> =>
  ({ type: 'run', language, source, world, breakpoints: [], delay: 0, allowImports: false, files: {}, shared: createSharedState(), database: createDbBuffer() })
// Hinweise der .NET-Laufzeit in Node (Content-Type) gehören nicht zur Programmausgabe
const output = () => messages.filter(m => m.type === 'output').map(m => (m as { text: string }).text).filter(t => !t.startsWith('MONO_WASM'))

describe('Datenbank-API', { timeout: 180_000 }, () => {
  it('JavaScript: open, query mit Parametern, execute, queryOne, tables, Fehler abfangbar', () => {
    const run = message('javascript', `import { Database } from 'klonk'
const db = Database.open('schule')
console.log(db.name, db.engine, db.tables().join(','))
for (const s of db.query('SELECT name, note FROM schueler WHERE klasse = ? ORDER BY name', ['7a'])) console.log(s.name, s.note)
console.log(db.execute('UPDATE schueler SET note = ? WHERE klasse = ?', [3, '7a']))
console.log(db.queryOne('SELECT count(*) AS n FROM schueler WHERE note = 3').n, db.queryOne('SELECT 1 WHERE 0'))
try { db.query('SELEC 1') } catch (e) { console.log(e.name, e.message) }
const tmp = Database.memory()
tmp.execute('CREATE TABLE t (x)')
console.log(tmp.name, tmp.tables())
db.query('SELECT * FROM fehlt')`)
    runJavaScript(run, postFor(run.database!, messages))
    expect(output()).toEqual([
      'schule sqlite schueler',
      'Ali –',
      'Mia 1.5',
      '2',
      '2 –',
      'DatabaseError near "SELEC": syntax error',
      'memory [t]',
    ])
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'sql_error', params: { message: 'no such table: fehlt' }, range: { line: 11 } } })
  })

  it('JavaScript: unbekannte Datenbank ⇒ übersetzbarer Fehler', () => {
    const run = message('javascript', `import { Database } from 'klonk'\nDatabase.open('gibtsnicht')`)
    runJavaScript(run, postFor(run.database!, messages))
    expect(messages.at(-1)).toMatchObject({ type: 'error', error: { code: 'db_not_found', params: { name: 'gibtsnicht' }, range: { line: 2 } } })
  })

  it('Python: dicts, query_one, execute, DatabaseError', async () => {
    const run = message('python', `from klonk import Database, DatabaseError
db = Database.open("schule")
print(db, db.tables())
print([s["name"] for s in db.query("SELECT name FROM schueler WHERE klasse = ? ORDER BY id", ("7a",))])
print(db.query_one("SELECT note FROM schueler WHERE name = ?", "Ben"))
print(db.execute("DELETE FROM schueler WHERE note IS NULL"))
try:
    db.query("SELECT nix FROM schueler")
except DatabaseError as e:
    print("Fehler:", e)
`)
    await runPython(run, postFor(run.database!, messages), () => loadPyodide())
    expect(output()).toEqual([
      'Database(\'schule\', sqlite) [\'schueler\']',
      '[\'Mia\', \'Ali\']',
      // REAL 2.0 kommt als JS-Zahl 2 an (JSON kennt keinen Unterschied)
      '{\'note\': 2}',
      '1',
      'Fehler: no such column: nix',
    ])
    expect(messages.at(-1)).toEqual({ type: 'done' })
  })

  it('Java: List<Row>, Varargs, DatabaseException', async () => {
    const run = message('java', `import klonk.Database; import klonk.DatabaseException; import klonk.Row; import java.util.List;
public class Main {
  public static void main(String[] args) {
    Database db = Database.open("schule");
    List<Row> rows = db.query("SELECT id, name, note FROM schueler WHERE klasse = ? ORDER BY id", "7a");
    for (Row r : rows) System.out.println(r.getInt("id") + " " + r.getString("name") + " " + r.getDouble("note") + " " + r.isNull("note"));
    System.out.println(db.execute("INSERT INTO schueler (name, klasse) VALUES (?, ?)", "Eva", "8c"));
    System.out.println(db.queryOne("SELECT count(*) AS n FROM schueler").getInt("n"));
    try { db.query("SELECT * FROM fehlt"); } catch (DatabaseException e) { System.out.println("Fehler: " + e.getMessage()); }
  }
}`)
    const teavm = new URL('../teavm/', import.meta.url)
    const toolchain = async () => {
      const { load } = await import(new URL('compiler.wasm-runtime.js', teavm).href)
      const bin = (name: string) => new Int8Array(readFileSync(new URL(name, teavm)))
      return { load, compiler: readFileSync(new URL('compiler.wasm', teavm)), sdk: bin('compile-classlib-teavm.bin'), classlib: bin('runtime-classlib-teavm.bin') }
    }
    await runJava(run, postFor(run.database!, messages), toolchain)
    expect(messages.at(-1)).toEqual({ type: 'done' })
    expect(output()).toEqual(['1 Mia 1.5 false', '3 Ali 0.0 true', '1', '4', 'Fehler: no such table: fehlt'])
    expect(messages.at(-1)).toEqual({ type: 'done' })
  })

  const dotnet = new URL('../dotnet/', import.meta.url)
  it.skipIf(!existsSync(new URL('dotnet.js', dotnet)))('C#: List<Row>, params, DatabaseException', async () => {
    const run = message('csharp', `using klonk;
var db = Database.Open("schule");
foreach (var r in db.Query("SELECT id, name, note FROM schueler WHERE klasse = ? ORDER BY id", "7a"))
    Console.WriteLine($"{r.GetInt("id")} {r.GetString("name")} {r.GetDouble("note")} {r.IsNull("note")}");
Console.WriteLine(db.Execute("UPDATE schueler SET klasse = ?", "9a"));
Console.WriteLine(db.QueryOne("SELECT name FROM schueler WHERE id = ?", 2));
try { db.Query("SELECT * FROM fehlt"); } catch (DatabaseException e) { Console.WriteLine("Fehler: " + e.Message); }
`)
    const host = import(new URL('dotnet.js', dotnet).href).then(m => m.dotnet.create())
    await runCSharp(run, postFor(run.database!, messages), () => host)
    expect(output()).toEqual(['1 Mia 1.5 False', '3 Ali 0 True', '3', '{ name: "Ben" }', 'Fehler: no such table: fehlt'])
    expect(messages.at(-1)).toEqual({ type: 'done' })
  })
})
