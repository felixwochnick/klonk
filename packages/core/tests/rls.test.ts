import { fileURLToPath } from 'node:url'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aiCreditGrants, aiUsage, cloudAssignments, cloudFiles, cloudProjects, groupMembers, groups, instanceSettings, organizationAiSettings, organizationAuthSettings, organizations, sessions, userLicenses, users } from '../server/database/schema'
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

  it('Instanz-Einstellungen (Lizenz) nur für Plattform-Admins', async () => {
    await runAsUser(db, ids.owner!, tx => tx.insert(instanceSettings).values({ key: 'license', value: 'token' }))
    expect(await runAsUser(db, ids.adminA!, tx => tx.select().from(instanceSettings))).toEqual([])
    await expectDbError(runAsUser(db, ids.adminA!, tx =>
      tx.insert(instanceSettings).values({ key: 'other', value: 'x' })), /row-level security/)
    expect(await runAsUser(db, ids.owner!, tx => tx.select().from(instanceSettings))).toHaveLength(1)
  })

  it('Lizenz-Token der Organisation setzen nur deren Admins', async () => {
    const asTeacher = await runAsUser(db, ids.teacherA!, tx => tx.update(organizations)
      .set({ licenseToken: 'x' }).where(eq(organizations.id, ids.orgA!)).returning({ id: organizations.id }))
    expect(asTeacher).toHaveLength(0)
    const asAdmin = await runAsUser(db, ids.adminA!, tx => tx.update(organizations)
      .set({ licenseToken: 'x' }).where(eq(organizations.id, ids.orgA!)).returning({ id: organizations.id }))
    expect(asAdmin).toHaveLength(1)
  })

  it('KI-Einstellungen: Mitglieder lesen die eigene Organisation, ändern nur Admins', async () => {
    await runAsUser(db, ids.adminA!, tx => tx.insert(organizationAiSettings).values({ organizationId: ids.orgA!, mode: 'server', models: [{ id: 'm', access: 'all' }] }))
    await expectDbError(runAsUser(db, ids.adminA!, tx =>
      tx.insert(organizationAiSettings).values({ organizationId: ids.orgB!, mode: 'off' })), /row-level security/)
    await expectDbError(runAsUser(db, ids.teacherA!, tx =>
      tx.insert(organizationAiSettings).values({ organizationId: ids.orgA!, mode: 'off' })
        .onConflictDoUpdate({ target: organizationAiSettings.organizationId, set: { mode: 'off' } })), /row-level security/)

    const asStudent = await runAsUser(db, ids.studentA!, tx => tx.select().from(organizationAiSettings))
    expect(asStudent.map(r => [r.organizationId, r.mode])).toEqual([[ids.orgA, 'server']])
    expect(await runAsUser(db, ids.adminB!, tx => tx.select().from(organizationAiSettings))).toEqual([])
    expect(await runAsUser(db, ids.private!, tx => tx.select().from(organizationAiSettings))).toEqual([])
  })

  it('KI-Verbrauch und Credits: Admins sehen die Organisation, Nutzer sich selbst, schreiben nur der Server', async () => {
    await db.insert(aiUsage).values([
      { organizationId: ids.orgA!, userId: ids.studentA!, source: 'platform', model: 'm', millicredits: 10 },
      { organizationId: ids.orgA!, userId: ids.student2A!, source: 'platform', model: 'm', millicredits: 20 },
      { organizationId: ids.orgB!, userId: ids.adminB!, source: 'server', model: 'm' },
    ])
    await db.insert(aiCreditGrants).values([
      { id: 'grant-a', organizationId: ids.orgA!, credits: 500 },
      { id: 'grant-privat', userId: ids.private!, credits: 100 },
    ])
    const usage = (as: string) => runAsUser(db, ids[as]!, tx => tx.select({ userId: aiUsage.userId }).from(aiUsage)).then(r => r.map(u => u.userId).sort())
    expect(await usage('adminA')).toEqual([ids.studentA, ids.student2A].sort())
    expect(await usage('studentA')).toEqual([ids.studentA])
    expect(await usage('teacherA')).toEqual([])
    expect(await usage('adminB')).toEqual([ids.adminB])
    expect(await usage('owner')).toHaveLength(3)

    const grants = (as: string) => runAsUser(db, ids[as]!, tx => tx.select({ id: aiCreditGrants.id }).from(aiCreditGrants)).then(r => r.map(g => g.id).sort())
    expect(await grants('adminA')).toEqual(['grant-a'])
    expect(await grants('studentA')).toEqual([])
    expect(await grants('private')).toEqual(['grant-privat'])

    await expectDbError(runAsUser(db, ids.studentA!, tx =>
      tx.insert(aiUsage).values({ organizationId: ids.orgA!, userId: ids.studentA!, source: 'platform', model: 'm' })), /permission denied/)
    await expectDbError(runAsUser(db, ids.adminA!, tx =>
      tx.insert(aiCreditGrants).values({ id: 'selbst', organizationId: ids.orgA!, credits: 99999 })), /permission denied/)
  })

  it('Privat-Lizenzen liest nur das eigene Konto, schreiben kann niemand über RLS', async () => {
    await db.insert(userLicenses).values({ userId: ids.private!, token: 'privat-token' })
    expect(await runAsUser(db, ids.private!, tx => tx.select().from(userLicenses))).toHaveLength(1)
    expect(await runAsUser(db, ids.adminA!, tx => tx.select().from(userLicenses))).toEqual([])
    expect(await runAsUser(db, ids.owner!, tx => tx.select().from(userLicenses))).toHaveLength(1)
    await expectDbError(runAsUser(db, ids.private!, tx =>
      tx.update(userLicenses).set({ token: 'x' }).where(eq(userLicenses.userId, ids.private!))), /permission denied/)
  })
})

describe('RLS: Gruppen und Klonk Cloud', () => {
  const as = <T>(who: string, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(db, ids[who]!, fn)

  it('Lehrkräfte legen Gruppen an und leiten sie, Lernende sehen nur eigene Gruppen', async () => {
    // Lernende:r derselben Organisation, aber nicht in der Gruppe
    const [outsider] = await db.insert(users).values({ organizationId: ids.orgA!, username: 'outsider', displayName: 'Außen', role: 'member' }).returning()
    ids.outsider = outsider!.id
    const [group] = await as('teacherA', tx => tx.insert(groups).values({ organizationId: ids.orgA!, name: '7a' }).returning())
    ids.group = group!.id
    // Leere Gruppe: anlegende Lehrkraft trägt sich als Leitung ein, danach verwaltet sie die Mitglieder
    await as('teacherA', tx => tx.insert(groupMembers).values({ groupId: ids.group!, userId: ids.teacherA!, role: 'leader' }))
    await as('teacherA', tx => tx.insert(groupMembers).values({ groupId: ids.group!, userId: ids.studentA!, role: 'member' }))
    // Fremde Organisation und Lernende können keine Mitglieder eintragen
    await expectDbError(as('teacherA', tx => tx.insert(groupMembers).values({ groupId: ids.group!, userId: ids.adminB! })), /row-level security/)
    await expectDbError(as('studentA', tx => tx.insert(groupMembers).values({ groupId: ids.group!, userId: ids.outsider! })), /row-level security/)
    // Andere Lehrkraft kann sich nicht in eine bestehende Gruppe als Leitung eintragen – Admin schon
    await expectDbError(as('adminB', tx => tx.insert(groups).values({ organizationId: ids.orgA!, name: 'fremd' })), /row-level security/)
    await as('adminA', tx => tx.insert(groupMembers).values({ groupId: ids.group!, userId: ids.adminA!, role: 'leader' }))

    expect(await as('studentA', tx => tx.select({ id: groups.id }).from(groups))).toEqual([{ id: ids.group }])
    expect(await as('outsider', tx => tx.select().from(groups))).toEqual([])
    expect(await as('adminB', tx => tx.select().from(groups))).toEqual([])
    await expectDbError(as('studentA', tx => tx.insert(groups).values({ organizationId: ids.orgA!, name: 'eigene' })), /row-level security/)
    const renamed = await as('studentA', tx => tx.update(groups).set({ membersCanWrite: true }).where(eq(groups.id, ids.group!)).returning())
    expect(renamed).toHaveLength(0)
  })

  it('Gemeinsamer Ordner: Mitglieder lesen, schreiben erst nach Freigabe', async () => {
    const [shared] = await as('teacherA', tx => tx.insert(cloudProjects).values({ groupId: ids.group!, name: '7a' }).returning())
    ids.shared = shared!.id
    await as('teacherA', tx => tx.insert(cloudFiles).values({ projectId: ids.shared!, path: 'Aufgabe 1/main.klonk', content: 'schritt', revision: 1 }))
    expect(await as('studentA', tx => tx.select({ path: cloudFiles.path }).from(cloudFiles))).toEqual([{ path: 'Aufgabe 1/main.klonk' }])
    expect(await as('outsider', tx => tx.select().from(cloudFiles))).toEqual([])
    await expectDbError(as('studentA', tx => tx.insert(cloudFiles).values({ projectId: ids.shared!, path: 'x.klonk', content: '', revision: 2 })), /row-level security/)

    await as('teacherA', tx => tx.update(groups).set({ membersCanWrite: true }).where(eq(groups.id, ids.group!)))
    await as('studentA', tx => tx.insert(cloudFiles).values({ projectId: ids.shared!, path: 'x.klonk', content: '', revision: 2 }))
    await as('teacherA', tx => tx.update(groups).set({ membersCanWrite: false }).where(eq(groups.id, ids.group!)))
  })

  it('Eigene Projekte sind privat, Abgaben sieht die Gruppenleitung', async () => {
    const [assignment] = await as('teacherA', tx => tx.insert(cloudAssignments).values({ groupId: ids.group!, path: 'Aufgabe 1' }).returning())
    const [own] = await as('studentA', tx => tx.insert(cloudProjects).values({ ownerId: ids.studentA!, name: 'Privat' }).returning())
    const [submission] = await as('studentA', tx => tx.insert(cloudProjects).values({ ownerId: ids.studentA!, name: 'Aufgabe 1', assignmentId: assignment!.id }).returning())
    await as('studentA', tx => tx.insert(cloudFiles).values({ projectId: submission!.id, path: 'main.klonk', content: 'lösung', revision: 1 }))

    const visible = (who: string) => as(who, tx => tx.select({ id: cloudProjects.id }).from(cloudProjects)).then(r => r.map(p => p.id).sort())
    expect(await visible('teacherA')).toEqual([ids.shared, submission!.id].sort())
    expect(await visible('outsider')).toEqual([])
    // Betreiber:in verwaltet Gruppen, sieht aber keine persönlichen Projekte/Abgaben
    expect(await visible('owner')).toEqual([ids.shared])
    expect(await visible('studentA')).toContain(own!.id)
    // Lehrkraft liest die Abgabe, ändert sie aber nicht
    expect(await as('teacherA', tx => tx.select({ content: cloudFiles.content }).from(cloudFiles).where(eq(cloudFiles.projectId, submission!.id)))).toEqual([{ content: 'lösung' }])
    await expectDbError(as('teacherA', tx => tx.insert(cloudFiles).values({ projectId: submission!.id, path: 'x.klonk', revision: 2 })), /row-level security/)
    // Abgabe nur zu Aufgaben der eigenen Gruppe; fremde Projekte nicht anlegen
    await expectDbError(as('outsider', tx => tx.insert(cloudProjects).values({ ownerId: ids.outsider!, name: 'A', assignmentId: assignment!.id })), /row-level security/)
    await expectDbError(as('outsider', tx => tx.insert(cloudProjects).values({ ownerId: ids.studentA!, name: 'B' })), /row-level security/)
  })
})
