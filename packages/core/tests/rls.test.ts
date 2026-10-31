import { fileURLToPath } from 'node:url'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { organizationAuthSettings, organizations, sessions, users } from '../server/database/schema'
import { createDb, runAsUser, type Db } from '../server/utils/db'

// Integrationstest gegen eine echte Postgres-Instanz (pnpm db:up) in einer eigenen Test-Datenbank
const baseUrl = process.env.KLONK_TEST_DATABASE_URL ?? 'postgres://klonk:klonk@localhost:5432/klonk'
const testDbName = 'klonk_rls_test'
const testUrl = baseUrl.replace(/\/[^/]+$/, `/${testDbName}`)

let db: Db
const ids: Record<string, string> = {}

beforeAll(async () => {
  const admin = postgres(baseUrl, { max: 1, onnotice: () => {} })
  await admin.unsafe(`drop database if exists ${testDbName} with (force)`)
  await admin.unsafe(`create database ${testDbName}`)
  await admin.end()

  const client = postgres(testUrl, { max: 1, onnotice: () => {} })
  await migrate(drizzle(client), {
    migrationsFolder: fileURLToPath(new URL('../server/database/migrations', import.meta.url)),
  })
  await client.end()

  db = createDb(testUrl)
  const [orgA, orgB] = await db.insert(organizations).values([
    { type: 'school', name: 'Schule A', domain: 'a.test' },
    { type: 'company', name: 'Firma B', domain: 'b.test' },
  ]).returning()
  ids.orgA = orgA!.id
  ids.orgB = orgB!.id
  await db.insert(organizationAuthSettings).values([{ organizationId: orgA!.id }, { organizationId: orgB!.id }])

  const rows = await db.insert(users).values([
    { organizationId: orgA!.id, username: 'admin', displayName: 'Admin A', role: 'admin' },
    { organizationId: orgA!.id, username: 'teacher', displayName: 'Lehrkraft A', role: 'teacher' },
    { organizationId: orgA!.id, username: 'student', displayName: 'Schüler A', role: 'member' },
    { organizationId: orgA!.id, username: 'student2', displayName: 'Schüler A2', role: 'member' },
    { organizationId: orgB!.id, username: 'admin', displayName: 'Admin B', role: 'admin' },
    { organizationId: null, email: 'privat@example.com', displayName: 'Privat' },
    { organizationId: null, email: 'owner@example.com', displayName: 'Owner', platformRole: 'owner' },
  ]).returning()
  for (const [i, key] of ['adminA', 'teacherA', 'studentA', 'student2A', 'adminB', 'private', 'owner'].entries())
    ids[key] = rows[i]!.id
})

afterAll(async () => {
  await (db?.$client as postgres.Sql | undefined)?.end()
})

/** Drizzle verpackt Postgres-Fehler – die eigentliche Meldung steckt in `cause` */
async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  const error = await promise.then(() => null, (e: Error) => e)
  expect(error, 'Abfrage hätte fehlschlagen müssen').not.toBeNull()
  expect(String((error!.cause as Error | undefined)?.message ?? error!.message)).toMatch(pattern)
}

const visibleUsers = (as: string) =>
  runAsUser(db, ids[as]!, tx => tx.select({ id: users.id }).from(users)).then(r => r.map(u => u.id).sort())

describe('RLS: users', () => {
  it('Lernende sehen nur sich selbst', async () => {
    expect(await visibleUsers('studentA')).toEqual([ids.studentA])
  })

  it('Privatkonten sehen nur sich selbst', async () => {
    expect(await visibleUsers('private')).toEqual([ids.private])
  })

  it('Lehrkräfte und Admins sehen nur die eigene Organisation', async () => {
    const orgA = [ids.adminA, ids.teacherA, ids.studentA, ids.student2A].sort()
    expect(await visibleUsers('teacherA')).toEqual(orgA)
    expect(await visibleUsers('adminA')).toEqual(orgA)
    expect(await visibleUsers('adminB')).toEqual([ids.adminB])
  })

  it('Plattform-Besitzer sehen alle Konten', async () => {
    expect((await visibleUsers('owner')).length).toBe(7)
  })

  it('ohne Nutzerkontext ist nichts sichtbar', async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role klonk_user`)
      return tx.select().from(users)
    })
    expect(rows).toEqual([])
  })

  it('Lernende können ihre Rolle nicht erhöhen', async () => {
    await expectDbError(runAsUser(db, ids.studentA!, tx =>
      tx.update(users).set({ role: 'admin' }).where(eq(users.id, ids.studentA!)),
    ), /row-level security/)
  })

  it('Lernende können ihren Anzeigenamen ändern', async () => {
    const rows = await runAsUser(db, ids.studentA!, tx =>
      tx.update(users).set({ displayName: 'Neu' }).where(eq(users.id, ids.studentA!)).returning({ id: users.id }))
    expect(rows).toHaveLength(1)
  })

  it('Lernende können andere Konten nicht ändern', async () => {
    const rows = await runAsUser(db, ids.studentA!, tx =>
      tx.update(users).set({ displayName: 'Hack' }).where(eq(users.id, ids.student2A!)).returning({ id: users.id }))
    expect(rows).toHaveLength(0)
  })

  it('Lehrkräfte setzen Passwörter von Lernenden zurück, nicht von Admins', async () => {
    const ok = await runAsUser(db, ids.teacherA!, tx =>
      tx.update(users).set({ passwordHash: 'x', mustChangePassword: true }).where(eq(users.id, ids.studentA!)).returning({ id: users.id }))
    expect(ok).toHaveLength(1)

    const denied = await runAsUser(db, ids.teacherA!, tx =>
      tx.update(users).set({ passwordHash: 'x' }).where(eq(users.id, ids.adminA!)).returning({ id: users.id }))
    expect(denied).toHaveLength(0)
  })

  it('Lehrkräfte können sich nicht selbst zum Admin machen', async () => {
    await expectDbError(runAsUser(db, ids.teacherA!, tx =>
      tx.update(users).set({ role: 'admin' }).where(eq(users.id, ids.teacherA!)),
    ), /row-level security/)
  })

  it('Lehrkräfte können Lernende nicht befördern', async () => {
    await expectDbError(runAsUser(db, ids.teacherA!, tx =>
      tx.update(users).set({ role: 'teacher' }).where(eq(users.id, ids.studentA!)),
    ), /row-level security/)
  })

  it('Admins verwalten Konten der eigenen Organisation, nicht fremder', async () => {
    const own = await runAsUser(db, ids.adminA!, tx =>
      tx.update(users).set({ role: 'teacher' }).where(eq(users.id, ids.student2A!)).returning({ id: users.id }))
    expect(own).toHaveLength(1)

    const foreign = await runAsUser(db, ids.adminA!, tx =>
      tx.update(users).set({ displayName: 'Hack' }).where(eq(users.id, ids.adminB!)).returning({ id: users.id }))
    expect(foreign).toHaveLength(0)
  })

  it('Admins können keine Plattformrollen vergeben', async () => {
    await expectDbError(runAsUser(db, ids.adminA!, tx =>
      tx.update(users).set({ platformRole: 'owner' }).where(eq(users.id, ids.studentA!)),
    ), /row-level security/)
  })

  it('Admins legen Konten nur in der eigenen Organisation an', async () => {
    const created = await runAsUser(db, ids.adminA!, tx =>
      tx.insert(users).values({ organizationId: ids.orgA!, username: 'neu', displayName: 'Neu' }).returning({ id: users.id }))
    expect(created).toHaveLength(1)

    await expectDbError(runAsUser(db, ids.adminA!, tx =>
      tx.insert(users).values({ organizationId: ids.orgB!, username: 'neu', displayName: 'Neu' }),
    ), /row-level security/)
  })

  it('Admins können sich nicht selbst löschen', async () => {
    const rows = await runAsUser(db, ids.adminA!, tx =>
      tx.delete(users).where(eq(users.id, ids.adminA!)).returning({ id: users.id }))
    expect(rows).toHaveLength(0)
  })
})

describe('RLS: organizations & Einstellungen', () => {
  it('Mitglieder sehen nur ihre Organisation', async () => {
    const rows = await runAsUser(db, ids.studentA!, tx => tx.select({ id: organizations.id }).from(organizations))
    expect(rows.map(r => r.id)).toEqual([ids.orgA])
  })

  it('Login-Einstellungen (mit Secrets) sehen nur Admins', async () => {
    const asTeacher = await runAsUser(db, ids.teacherA!, tx => tx.select().from(organizationAuthSettings))
    expect(asTeacher).toEqual([])

    const asAdmin = await runAsUser(db, ids.adminA!, tx => tx.select().from(organizationAuthSettings))
    expect(asAdmin.map(r => r.organizationId)).toEqual([ids.orgA])
  })

  it('Sessions sind für die Nutzerrolle gesperrt', async () => {
    await expectDbError(runAsUser(db, ids.owner!, tx => tx.select().from(sessions)), /permission denied/)
  })
})
