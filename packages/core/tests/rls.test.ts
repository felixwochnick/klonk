import { fileURLToPath } from 'node:url'
import { and, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aiCreditGrants, aiUsage, cloudAssignments, cloudFiles, cloudProjects, customLearnModules, groupLearnModules, groupMembers, groups, instanceSettings, mcpOauthClients, mcpOauthCodes, mcpTokens, organizationAiSettings, organizationAuthSettings, organizations, sessions, userLicenses, users } from '../server/database/schema'
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

  it('Untergruppen: die Leitung der Klasse verwaltet sie, Mitglieder kommen nur aus der Klasse', async () => {
    const [other] = await db.insert(users).values({ organizationId: ids.orgA!, username: 'teacher-sub', displayName: 'Lehrkraft A3', role: 'teacher' }).returning()
    ids.teacherSub = other!.id
    await as('teacherA', tx => tx.insert(groupMembers).values({ groupId: ids.group!, userId: ids.student2A!, role: 'member' }))
    const [team] = await as('teacherA', tx => tx.insert(groups).values({ organizationId: ids.orgA!, name: 'Team 1', parentId: ids.group!, collabMode: 'project', membersCanWrite: true }).returning())
    ids.team = team!.id
    // Namen sind je Klasse eindeutig – eine Untergruppe darf wie eine Klasse heißen
    const [world] = await as('teacherA', tx => tx.insert(groups).values({ organizationId: ids.orgA!, name: '7a', parentId: ids.group!, collabMode: 'world' }).returning())
    // Nicht erlaubt: Lehrkraft ohne Leitung der Klasse, Lernende, Untergruppe einer Untergruppe, fehlender Modus
    const sub = (name: string, parentId = ids.group!) => ({ organizationId: ids.orgA!, name, parentId, collabMode: 'world' as const })
    await expectDbError(as('teacherSub', tx => tx.insert(groups).values(sub('Fremd'))), /row-level security/)
    await expectDbError(as('studentA', tx => tx.insert(groups).values(sub('Eigen'))), /row-level security/)
    await expectDbError(as('teacherA', tx => tx.insert(groups).values(sub('Tief', ids.team!))), /row-level security/)
    await expectDbError(as('teacherA', tx => tx.insert(groups).values({ organizationId: ids.orgA!, name: 'Ohne', parentId: ids.group! })), /groups_collab_mode_check/)

    // Mitglieder nur aus der Klasse; die Leitung der Klasse muss nicht selbst Mitglied sein
    await as('teacherA', tx => tx.insert(groupMembers).values([{ groupId: ids.team!, userId: ids.studentA! }, { groupId: ids.team!, userId: ids.student2A! }]))
    await expectDbError(as('teacherA', tx => tx.insert(groupMembers).values({ groupId: ids.team!, userId: ids.outsider! })), /row-level security/)
    await expectDbError(as('teacherSub', tx => tx.insert(groupMembers).values({ groupId: ids.team!, userId: ids.teacherSub!, role: 'leader' })), /row-level security/)

    // Gemeinsamer Ordner der Untergruppe: die Leitung der Klasse legt ihn an, Mitglieder schreiben darin
    const [project] = await as('teacherA', tx => tx.insert(cloudProjects).values({ groupId: ids.team!, name: 'Team 1' }).returning())
    await as('studentA', tx => tx.insert(cloudFiles).values({ projectId: project!.id, path: 'main.klonk', content: 'schritt', revision: 1 }))
    const files = (who: string) => as(who, tx => tx.select({ path: cloudFiles.path }).from(cloudFiles).where(eq(cloudFiles.projectId, project!.id)))
    expect(await files('student2A')).toEqual([{ path: 'main.klonk' }])
    expect(await files('teacherA')).toEqual([{ path: 'main.klonk' }])
    expect(await files('outsider')).toEqual([])

    // Lernende sehen nur ihre eigenen Untergruppen (student2A ist inzwischen Lehrkraft, siehe oben)
    const seen = (await as('studentA', tx => tx.select({ id: groups.id }).from(groups))).map(g => g.id)
    expect(seen).toEqual(expect.arrayContaining([ids.group, ids.team]))
    expect(seen).not.toContain(world!.id)
    // Die Leitung der Klasse ändert die Untergruppe, aber nicht deren Klasse
    expect(await as('teacherA', tx => tx.update(groups).set({ collabMode: 'world' }).where(eq(groups.id, ids.team!)).returning())).toHaveLength(1)
    await expectDbError(as('teacherA', tx => tx.update(groups).set({ parentId: null, collabMode: null }).where(eq(groups.id, ids.team!))), /row-level security/)
    expect(await as('teacherSub', tx => tx.update(groups).set({ collabMode: 'project' }).where(eq(groups.id, ids.team!)).returning())).toHaveLength(0)

    // Wer die Klasse verlässt, verlässt auch ihre Untergruppen
    await as('teacherA', tx => tx.delete(groupMembers).where(and(eq(groupMembers.groupId, ids.group!), eq(groupMembers.userId, ids.student2A!))))
    expect(await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, ids.team!), eq(groupMembers.userId, ids.student2A!)))).toEqual([])
    expect(await files('student2A')).toEqual([])
  })
})

describe('RLS: Lernmodule', () => {
  const as = <T>(who: string, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(db, ids[who]!, fn)
  const startModule = (who: string, module: string) => as(who, tx => tx.insert(cloudProjects).values({ ownerId: ids[who]!, name: `Modul ${module}`, learnModule: module }).returning())

  it('Lernende starten nur freigegebene Module, Privatkonten und Lehrkräfte alle', async () => {
    await expectDbError(startModule('studentA', 'sequence'), /row-level security/)
    // Freigeben darf nur, wer die Gruppe verwaltet
    await expectDbError(as('studentA', tx => tx.insert(groupLearnModules).values({ groupId: ids.group!, moduleId: 'sequence' })), /row-level security/)
    await as('teacherA', tx => tx.insert(groupLearnModules).values({ groupId: ids.group!, moduleId: 'sequence', enabledBy: ids.teacherA! }))
    expect(await as('studentA', tx => tx.select({ moduleId: groupLearnModules.moduleId }).from(groupLearnModules))).toEqual([{ moduleId: 'sequence' }])
    expect(await as('outsider', tx => tx.select().from(groupLearnModules))).toEqual([])

    const [project] = await startModule('studentA', 'sequence')
    ids.learnProject = project!.id
    await expectDbError(startModule('studentA', 'repeat'), /row-level security/)
    await expectDbError(startModule('outsider', 'sequence'), /row-level security/)
    await startModule('private', 'variables')
    await startModule('teacherA', 'variables')
  })

  it('Gruppenleitung liest Modulprojekte ihrer Mitglieder, solange das Modul freigegeben ist', async () => {
    await as('studentA', tx => tx.insert(cloudFiles).values({ projectId: ids.learnProject!, path: 'to-the-mark.klonk', content: 'schritt(4)', revision: 1 }))
    const read = (who: string) => as(who, tx => tx.select({ content: cloudFiles.content }).from(cloudFiles).where(eq(cloudFiles.projectId, ids.learnProject!)))
    expect(await read('teacherA')).toEqual([{ content: 'schritt(4)' }])
    expect(await read('adminB')).toEqual([])
    expect(await read('student2A')).toEqual([])
    // Betreiber:innen sehen keine persönlichen Projekte
    expect(await read('owner')).toEqual([])
    // Lesen ja, ändern nein
    await expectDbError(as('teacherA', tx => tx.insert(cloudFiles).values({ projectId: ids.learnProject!, path: 'x.klonk', revision: 2 })), /row-level security/)

    await as('teacherA', tx => tx.delete(groupLearnModules).where(eq(groupLearnModules.groupId, ids.group!)))
    expect(await read('teacherA')).toEqual([])
    expect(await read('studentA')).toEqual([{ content: 'schritt(4)' }])
  })

  it('Eigene Projekte lassen sich nicht nachträglich zum Modulprojekt machen', async () => {
    await as('teacherA', tx => tx.insert(groupLearnModules).values({ groupId: ids.group!, moduleId: 'repeat' }))
    const [own] = await as('studentA', tx => tx.insert(cloudProjects).values({ ownerId: ids.studentA!, name: 'Tagebuch' }).returning())
    await expectDbError(as('studentA', tx => tx.update(cloudProjects).set({ learnModule: 'repeat' }).where(eq(cloudProjects.id, own!.id))), /row-level security/)
    await expectDbError(as('studentA', tx => tx.update(cloudProjects).set({ learnModule: null }).where(eq(cloudProjects.id, ids.learnProject!))), /row-level security/)
    // Normale Änderungen (z. B. Revision beim Schreiben) gehen weiter
    await as('studentA', tx => tx.update(cloudProjects).set({ name: 'Tagebuch 2' }).where(eq(cloudProjects.id, own!.id)))
    await as('studentA', tx => tx.update(cloudProjects).set({ name: 'Lernmodul' }).where(eq(cloudProjects.id, ids.learnProject!)))
  })
})

describe('RLS: eigene Lernmodule', () => {
  const as = <T>(who: string, fn: Parameters<typeof runAsUser<T>>[2]) => runAsUser(db, ids[who]!, fn)
  const data = { version: 1, lang: 'de', track: 'basics', title: 'Schulhof', tasks: [] }
  const create = (who: string, values: Partial<typeof customLearnModules.$inferInsert> = {}) => as(who, tx => tx.insert(customLearnModules)
    .values({ organizationId: ids.orgA!, createdBy: ids[who]!, data, ...values }).returning({ id: customLearnModules.id }))
  const visible = (who: string) => as(who, tx => tx.select({ id: customLearnModules.id }).from(customLearnModules)).then(r => r.map(m => m.id))
  const rename = (who: string, title: string) => as(who, tx => tx.update(customLearnModules).set({ data: { ...data, title }, updatedBy: ids[who]! })
    .where(eq(customLearnModules.id, ids.custom!)).returning({ id: customLearnModules.id }))

  it('Lehrkräfte legen Module an, alle Lehrkräfte und Admins der Organisation sehen sie', async () => {
    const [teacher2] = await db.insert(users).values({ organizationId: ids.orgA!, username: 'teacher2', displayName: 'Lehrkraft A2', role: 'teacher' }).returning()
    ids.teacher2A = teacher2!.id
    const [module] = await create('teacherA')
    expect(module!.id).toMatch(/^custom-[0-9a-f-]{36}$/)
    ids.custom = module!.id

    // Nur Lehrkräfte/Admins, nur für die eigene Organisation, nur im eigenen Namen, ID vergibt die Datenbank
    await expectDbError(create('studentA'), /row-level security/)
    await expectDbError(create('private', { organizationId: ids.orgA! }), /row-level security/)
    await expectDbError(create('adminB'), /row-level security/)
    await expectDbError(create('teacherA', { organizationId: ids.orgB! }), /row-level security/)
    await expectDbError(create('teacherA', { createdBy: ids.teacher2A! }), /row-level security/)
    const [chosen] = await create('teacherA', { id: 'custom-eigene' })
    expect(chosen!.id).not.toBe('custom-eigene')
    await db.delete(customLearnModules).where(eq(customLearnModules.id, chosen!.id))

    expect(await visible('teacher2A')).toEqual([ids.custom])
    expect(await visible('adminA')).toEqual([ids.custom])
    for (const who of ['studentA', 'adminB', 'private', 'owner']) expect(await visible(who), who).toEqual([])
  })

  it('ändern und löschen nur Autor:in und Admins der Organisation', async () => {
    expect(await rename('teacher2A', 'Fremd')).toEqual([])
    expect(await rename('studentA', 'Fremd')).toEqual([])
    expect(await rename('teacherA', 'Unser Schulhof')).toEqual([{ id: ids.custom }])
    expect(await rename('adminA', 'Unser Schulhof (Admin)')).toEqual([{ id: ids.custom }])
    // Organisation und Autor:in bleiben fest
    await expectDbError(as('teacherA', tx => tx.update(customLearnModules).set({ organizationId: ids.orgB! }).where(eq(customLearnModules.id, ids.custom!))), /permission denied/)
    await expectDbError(as('teacherA', tx => tx.update(customLearnModules).set({ createdBy: ids.teacher2A! }).where(eq(customLearnModules.id, ids.custom!))), /permission denied/)
    expect(await as('teacher2A', tx => tx.delete(customLearnModules).where(eq(customLearnModules.id, ids.custom!)).returning())).toEqual([])
  })

  it('Freigabe nur in Gruppen der Organisation; Lernende sehen und starten freigegebene Module', async () => {
    const startModule = (who: string) => as(who, tx => tx.insert(cloudProjects).values({ ownerId: ids[who]!, name: 'Schulhof', learnModule: ids.custom! }).returning())
    await expectDbError(startModule('studentA'), /row-level security/)
    // Fremde Organisation kann das Modul weder sehen noch in ihren Gruppen freigeben, auch nicht starten
    const [groupB] = await as('adminB', tx => tx.insert(groups).values({ organizationId: ids.orgB!, name: 'Azubis' }).returning())
    await expectDbError(as('adminB', tx => tx.insert(groupLearnModules).values({ groupId: groupB!.id, moduleId: ids.custom! })), /row-level security/)
    await expectDbError(startModule('adminB'), /row-level security/)
    await expectDbError(startModule('private'), /row-level security/)

    await as('teacherA', tx => tx.insert(groupLearnModules).values({ groupId: ids.group!, moduleId: ids.custom!, enabledBy: ids.teacherA! }))
    expect(await visible('studentA')).toEqual([ids.custom])
    expect(await visible('outsider')).toEqual([])
    const [project] = await startModule('studentA')
    await startModule('teacher2A')
    await as('studentA', tx => tx.insert(cloudFiles).values({ projectId: project!.id, path: 'klonk.json', content: '{}', revision: 1 }))
    // Gruppenleitung liest den Lernstand
    expect(await as('teacherA', tx => tx.select({ path: cloudFiles.path }).from(cloudFiles).where(eq(cloudFiles.projectId, project!.id)))).toEqual([{ path: 'klonk.json' }])
    ids.customProject = project!.id
  })

  it('gelöschte Module verschwinden aus allen Freigaben', async () => {
    expect(await as('teacherA', tx => tx.delete(customLearnModules).where(eq(customLearnModules.id, ids.custom!)).returning({ id: customLearnModules.id }))).toEqual([{ id: ids.custom }])
    expect(await db.select().from(groupLearnModules).where(eq(groupLearnModules.moduleId, ids.custom!))).toEqual([])
    expect(await visible('studentA')).toEqual([])
    // Das Modulprojekt gehört weiter den Lernenden
    expect(await as('studentA', tx => tx.select({ id: cloudProjects.id }).from(cloudProjects).where(eq(cloudProjects.id, ids.customProject!)))).toHaveLength(1)
  })
})

describe('RLS: MCP-Zugang', () => {
  const token = (userId: string, access: 'read' | 'write' | 'full', name = 'Token') => ({
    userId,
    kind: 'personal' as const,
    name,
    access,
    tokenHash: `hash-${name}-${userId}-${access}`,
    expiresAt: new Date(Date.now() + 86_400_000),
  })

  it('Stufe je Konto ändern nur Admins der Organisation (auch die eigene) und Betreiber:innen', async () => {
    // Lehrkraft darf Lernende bearbeiten (Passwort), aber nicht deren KI-Zugriff – und nicht den eigenen
    await expectDbError(runAsUser(db, ids.teacherA!, tx => tx.update(users).set({ mcpAccess: 'full' }).where(eq(users.id, ids.studentA!))), /mcp_access_forbidden/)
    await expectDbError(runAsUser(db, ids.teacherA!, tx => tx.update(users).set({ mcpAccess: 'full' }).where(eq(users.id, ids.teacherA!))), /mcp_access_forbidden/)
    await expectDbError(runAsUser(db, ids.private!, tx => tx.update(users).set({ mcpAccess: 'read' }).where(eq(users.id, ids.private!))), /mcp_access_forbidden/)

    await runAsUser(db, ids.adminA!, tx => tx.update(users).set({ mcpAccess: 'write' }).where(eq(users.id, ids.teacherA!)))
    await runAsUser(db, ids.adminA!, tx => tx.update(users).set({ mcpAccess: 'full' }).where(eq(users.id, ids.adminA!)))
    // Fremde Organisation: Zeile nicht sichtbar ⇒ keine Änderung
    const other = await runAsUser(db, ids.adminB!, tx => tx.update(users).set({ mcpAccess: 'full' }).where(eq(users.id, ids.teacherA!)).returning({ id: users.id }))
    expect(other).toEqual([])
    await runAsUser(db, ids.owner!, tx => tx.update(users).set({ mcpAccess: 'read' }).where(eq(users.id, ids.private!)))

    const rows = await db.select({ id: users.id, access: users.mcpAccess }).from(users)
    const accessOf = (id: string) => rows.find(r => r.id === id)?.access
    expect([accessOf(ids.teacherA!), accessOf(ids.adminA!), accessOf(ids.private!), accessOf(ids.studentA!)]).toEqual(['write', 'full', 'read', 'none'])
  })

  it('Tokens: nur für sich selbst, höchstens die eigene Stufe, nur die eigenen sichtbar', async () => {
    await runAsUser(db, ids.teacherA!, tx => tx.insert(mcpTokens).values(token(ids.teacherA!, 'write')))
    await expectDbError(runAsUser(db, ids.teacherA!, tx => tx.insert(mcpTokens).values(token(ids.teacherA!, 'full'))), /row-level security/)
    await expectDbError(runAsUser(db, ids.teacherA!, tx => tx.insert(mcpTokens).values(token(ids.studentA!, 'read'))), /row-level security/)
    // Ohne freigeschaltete Stufe gar kein Token; OAuth-Verbindungen legt nur der Server an
    await expectDbError(runAsUser(db, ids.studentA!, tx => tx.insert(mcpTokens).values(token(ids.studentA!, 'read'))), /row-level security/)
    await expectDbError(runAsUser(db, ids.teacherA!, tx => tx.insert(mcpTokens).values({ ...token(ids.teacherA!, 'read', 'oauth'), kind: 'oauth' })), /row-level security/)

    expect(await runAsUser(db, ids.teacherA!, tx => tx.select({ id: mcpTokens.id }).from(mcpTokens))).toHaveLength(1)
    expect(await runAsUser(db, ids.adminA!, tx => tx.select({ id: mcpTokens.id }).from(mcpTokens))).toEqual([])
    // Ändern (z. B. Stufe anheben) geht über RLS gar nicht
    await expectDbError(runAsUser(db, ids.teacherA!, tx => tx.update(mcpTokens).set({ access: 'full' })), /permission denied/)
    // Widerrufen nur eigene
    expect(await runAsUser(db, ids.adminA!, tx => tx.delete(mcpTokens).returning({ id: mcpTokens.id }))).toEqual([])
  })

  it('Zugang entzogen ⇒ alle Tokens des Kontos werden getrennt', async () => {
    await db.insert(mcpTokens).values(token(ids.teacherA!, 'read', 'zweites'))
    expect(await db.select().from(mcpTokens).where(eq(mcpTokens.userId, ids.teacherA!))).toHaveLength(2)
    await runAsUser(db, ids.adminA!, tx => tx.update(users).set({ mcpAccess: 'none' }).where(eq(users.id, ids.teacherA!)))
    expect(await db.select().from(mcpTokens).where(eq(mcpTokens.userId, ids.teacherA!))).toEqual([])
  })

  it('OAuth-Programme und -Codes sind nur dem Server zugänglich', async () => {
    await db.insert(mcpOauthClients).values({ id: 'client-test', name: 'Test', redirectUris: ['https://example.com/cb'] })
    await db.insert(mcpOauthCodes).values({ codeHash: 'code', clientId: 'client-test', userId: ids.adminA!, redirectUri: 'https://example.com/cb', codeChallenge: 'x', access: 'read', expiresAt: new Date() })
    await expectDbError(runAsUser(db, ids.adminA!, tx => tx.select().from(mcpOauthClients)), /permission denied/)
    await expectDbError(runAsUser(db, ids.adminA!, tx => tx.select().from(mcpOauthCodes)), /permission denied/)
  })
})
