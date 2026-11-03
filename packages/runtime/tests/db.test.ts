import { describe, expect, it } from 'vitest'
import { createSqlite } from '../src/db/sqlite'
import { createPostgres } from '../src/db/postgres'
import { SqlError } from '../src/db/types'
import { sqlToWorld, worldToSql } from '../src/db/world'
import type { WorldData } from '@klonk/world'

describe('SQLite', () => {
  it('führt Skripte aus, sichert als SQL und lädt wieder', async () => {
    const db = await createSqlite()
    const results = await db.script(`
      CREATE TABLE klasse (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      -- Kommentar; mit Semikolon
      INSERT INTO klasse (name) VALUES ('7a'), ('7b''s');
      SELECT * FROM klasse ORDER BY id;
      CREATE TRIGGER t AFTER INSERT ON klasse BEGIN UPDATE klasse SET name = upper(name) WHERE id = new.id; END;
    `)
    expect(results).toHaveLength(4)
    expect(results[1]!.changes).toBe(2)
    expect(results[2]!.rows).toEqual([[1, '7a'], [2, '7b\'s']])

    const dump = await db.dump()
    const copy = await createSqlite(dump)
    expect((await copy.query('SELECT name FROM klasse WHERE id = ?', [2])).rows).toEqual([['7b\'s']])
    await copy.query('INSERT INTO klasse (name) VALUES (?)', ['x'])
    expect((await copy.query('SELECT id, name FROM klasse ORDER BY id DESC LIMIT 1')).rows).toEqual([[3, 'X']])
    expect((await copy.tables()).map(t => [t.name, t.rows, t.columns.map(c => c.name)])).toEqual([['klasse', 3, ['id', 'name']]])
  })

  it('meldet Fehler mit Zeile und prüft Fremdschlüssel', async () => {
    const db = await createSqlite()
    const error = await db.script('CREATE TABLE a (id INTEGER PRIMARY KEY);\n\nSELECT * FROM fehlt;').catch(e => e)
    expect(error).toBeInstanceOf(SqlError)
    expect(error.line).toBe(3)
    expect(error.message).toContain('no such table: fehlt')
    expect(error.results).toHaveLength(1)
    await db.script('CREATE TABLE b (a INTEGER REFERENCES a(id));')
    await expect(db.query('INSERT INTO b VALUES (5)')).rejects.toThrow(/FOREIGN KEY/)
  })
})

describe('PostgreSQL (PGlite)', () => {
  it('führt Skripte aus, sichert per pg_dump und lädt wieder', async () => {
    const db = await createPostgres()
    const results = await db.script(`
      CREATE TABLE klasse (id serial PRIMARY KEY, name text NOT NULL, seit date);
      INSERT INTO klasse (name, seit) VALUES ('7a', '2026-09-01'), ('7b', NULL);
      SELECT id, name, seit FROM klasse ORDER BY id;
    `)
    expect(results[1]!.changes).toBe(2)
    expect(results[2]!.rows).toEqual([[1, '7a', '2026-09-01T00:00:00.000Z'], [2, '7b', null]])

    const dump = await db.dump()
    expect(dump).not.toMatch(/COPY .* FROM stdin/)
    // Nach dem Sichern gehen Abfragen ohne Schema weiter
    expect((await db.query('SELECT count(*)::int FROM klasse')).rows).toEqual([[2]])

    const copy = await createPostgres(dump)
    await copy.query('INSERT INTO klasse (name) VALUES ($1)', ['8c'])
    expect((await copy.query('SELECT id, name FROM klasse ORDER BY id')).rows).toEqual([[1, '7a'], [2, '7b'], [3, '8c']])
    const [table] = await copy.tables()
    expect(table).toMatchObject({ name: 'klasse', rows: 3 })
    expect(table!.columns[0]).toMatchObject({ name: 'id', type: 'integer', primaryKey: true, notNull: true })
    await db.close()
    await copy.close()
  }, 60_000)

  it('meldet Fehler mit Zeile', async () => {
    const db = await createPostgres()
    const error = await db.script('CREATE TABLE a (id int);\nSELECT nix FROM a;').catch(e => e)
    expect(error).toBeInstanceOf(SqlError)
    expect(error.line).toBe(2)
    expect(error.message).toContain('nix')
    await db.close()
  }, 60_000)
})

describe('Welt als Datenbank', () => {
  const world: WorldData = {
    version: 1,
    size: { width: 4, depth: 3, height: 3 },
    maxJump: 1,
    cells: [{ x: 1, z: 0, bricks: ['red', 'blue'] }, { x: 2, z: 2, mark: 'yellow', block: true }],
    characters: [{ id: 'Klonk', model: 'male', x: 0, z: 0, direction: 'south' }],
  }

  it('Tabellen auf Deutsch, Änderungen per SQL landen in der Welt', async () => {
    const db = await createSqlite(worldToSql(world, 'de'))
    expect((await db.query('SELECT x, y, ebene, farbe FROM ziegel ORDER BY ebene')).rows).toEqual([[2, 1, 1, 'rot'], [2, 1, 2, 'blau']])
    expect((await db.query('SELECT name, x, y, richtung, aussehen FROM figuren')).rows).toEqual([['Klonk', 1, 1, 'süden', 'männlich']])
    await db.script(`INSERT INTO ziegel VALUES (4, 3, 1, 'grün');
      UPDATE figuren SET richtung = 'osten', x = 2;
      INSERT INTO figuren VALUES ('Klara', 3, 1, 'westen', 'weiblich');
      DELETE FROM quader;`)
    const changed = await sqlToWorld(db, world, 'de')
    expect(changed.cells).toEqual(expect.arrayContaining([{ x: 3, z: 2, bricks: ['green'] }, { x: 2, z: 2, mark: 'yellow' }]))
    expect(changed.characters).toEqual([
      { id: 'Klonk', model: 'male', x: 1, z: 0, direction: 'east' },
      { id: 'Klara', model: 'female', x: 2, z: 0, direction: 'west' },
    ])
    // CHECK-Bedingungen fangen ungültige Werte ab, Koordinaten außerhalb meldet die Übertragung
    await expect(db.script(`UPDATE ziegel SET farbe = 'pink'`)).rejects.toThrow(/CHECK/)
    await db.script('UPDATE marken SET x = 9')
    await expect(sqlToWorld(db, world, 'de')).rejects.toMatchObject({ code: 'world_outside', params: { table: 'marken', x: '9' } })
  })

  it('englische Tabellen auch in PostgreSQL', async () => {
    const db = await createPostgres(worldToSql(world, 'en'))
    expect((await db.query('SELECT color, count(*)::int FROM bricks GROUP BY color ORDER BY color')).rows).toEqual([['blue', 1], ['red', 1]])
    await db.script('UPDATE world SET width = 6; INSERT INTO marks VALUES (6, 1, \'red\');')
    const changed = await sqlToWorld(db, world, 'en')
    expect(changed.size.width).toBe(6)
    expect(changed.cells).toContainEqual({ x: 5, z: 0, mark: 'red' })
    await db.close()
  }, 60_000)
})
