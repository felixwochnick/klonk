import { sql } from 'drizzle-orm'
import { bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core'
import type { AiModelChoice } from '../../shared/utils/ai'

// Row Level Security ist in der Migration `0001_rls.sql` definiert (Rollen, Hilfsfunktionen, Policies)

export const organizationType = pgEnum('organization_type', ['school', 'company'])

/** Rolle innerhalb einer Organisation – in Unternehmen heißen sie in der UI „Mitarbeitende / Ausbildende / Admin“ */
export const memberRole = pgEnum('member_role', ['member', 'teacher', 'admin'])

/** Plattformweite Rolle: `owner`/`developer` = Betreiber (Login via Authentik bzw. Instanz-Einrichtung) */
export const platformRole = pgEnum('platform_role', ['user', 'developer', 'owner'])

export const organizations = pgTable('organizations', {
  id: uuid().primaryKey().defaultRandom(),
  type: organizationType().notNull(),
  name: text().notNull(),
  // Domain-Teil des Logins: username@domain
  domain: text().notNull().unique(),
  // Lizenz-Token der Organisation (gehostete Plattform: Abo von Schule/Unternehmen)
  licenseToken: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export type OidcSettings = {
  issuer: string
  clientId: string
  /** AES-GCM-verschlüsselt (siehe server/utils/crypto.ts) */
  clientSecret: string
  scopes: string
  /** Claim, aus dem der Benutzername gelesen wird (z. B. preferred_username) */
  usernameClaim: string
  /** Claim mit Gruppen/Rollen und Zuordnung zu Klonk-Rollen */
  roleClaim?: string
  teacherValues?: string[]
  adminValues?: string[]
}

export type LdapSettings = {
  url: string
  bindDn: string
  /** AES-GCM-verschlüsselt */
  bindPassword: string
  baseDn: string
  /** `{{username}}` wird ersetzt, z. B. `(uid={{username}})` */
  userFilter: string
  usernameAttribute: string
  displayNameAttribute: string
  /** Gruppen-DNs (memberOf) für Rollen */
  teacherGroups?: string[]
  adminGroups?: string[]
  startTls?: boolean
}

export const organizationAuthSettings = pgTable('organization_auth_settings', {
  organizationId: uuid().primaryKey().references(() => organizations.id, { onDelete: 'cascade' }),
  localEnabled: boolean().notNull().default(true),
  oidcEnabled: boolean().notNull().default(false),
  oidc: jsonb().$type<OidcSettings>(),
  ldapEnabled: boolean().notNull().default(false),
  ldap: jsonb().$type<LdapSettings>(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  // null = Privatkonto
  organizationId: uuid().references(() => organizations.id, { onDelete: 'cascade' }),
  // Lokaler Teil von username@domain (nur Organisationskonten)
  username: text(),
  email: text(),
  displayName: text().notNull(),
  role: memberRole().notNull().default('member'),
  platformRole: platformRole().notNull().default('user'),
  passwordHash: text(),
  mustChangePassword: boolean().notNull().default(false),
  disabled: boolean().notNull().default(false),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp({ withTimezone: true }),
}, t => [
  uniqueIndex('users_organization_username_idx').on(t.organizationId, t.username),
  index('users_email_idx').on(t.email),
])

/** Verknüpfte externe Identitäten (OIDC/LDAP der Organisation, OAuth-Anbieter, Authentik) */
export const accounts = pgTable('accounts', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  // z. B. `oidc:<orgId>`, `ldap:<orgId>`, `github`, `google`, `microsoft`, `authentik`
  provider: text().notNull(),
  providerAccountId: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex('accounts_provider_idx').on(t.provider, t.providerAccountId),
  index('accounts_user_idx').on(t.userId),
])

/** Serverseitige Sessions – erlauben das Abmelden aller Geräte (z. B. nach Passwort-Reset) */
export const sessions = pgTable('sessions', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  userAgent: text(),
}, t => [
  index('sessions_user_idx').on(t.userId),
])

/** Einstellungen der gesamten Instanz (z. B. `license` = Lizenz-Token des Selbsthosters) – nur Plattform-Admins */
export const instanceSettings = pgTable('instance_settings', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

/** KI-Assistent: `inherit` = Standard der Instanz (NUXT_AI_*), `server` = OpenAI-kompatible API, `webllm` = Modell im Browser */
export const aiMode = pgEnum('ai_mode', ['inherit', 'off', 'server', 'webllm', 'platform'])
export const aiProvider = pgEnum('ai_provider', ['openai', 'anthropic'])

/** KI-Einstellungen einer Organisation (Zeile entsteht beim ersten Speichern) */
export const organizationAiSettings = pgTable('organization_ai_settings', {
  organizationId: uuid().primaryKey().references(() => organizations.id, { onDelete: 'cascade' }),
  mode: aiMode().notNull().default('inherit'),
  /** Eigener Anbieter (`server`): Schnittstelle und Adresse, z. B. `https://api.openai.com/v1` */
  provider: aiProvider().notNull().default('openai'),
  baseUrl: text(),
  /** AES-GCM-verschlüsselt */
  apiKey: text(),
  /** Freigegebene Modelle: bei `server` die Modellnamen des Anbieters, bei `platform` IDs der Klonk-KI (leer = Standard) */
  models: jsonb().$type<AiModelChoice[]>().notNull().default([]),
  webllmModel: text(),
  /** Lernende bekommen nur Hinweise statt fertiger Lösungen (Lehrkräfte/Admins immer volle Hilfe) */
  tutor: boolean().notNull().default(true),
  /** Tageslimits pro Lernendem (`null` = ohne): Anfragen bzw. Credits der Klonk-KI */
  studentDailyRequests: integer(),
  studentDailyCredits: integer(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

/**
 * Verbrauch des KI-Assistenten über den Server (ohne Chatinhalte). Schreibt nur der Server (Systemverbindung);
 * Admins sehen den Verbrauch ihrer Organisation, Nutzer ihren eigenen.
 */
export const aiUsage = pgTable('ai_usage', {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** `server` = eigener Schlüssel (kostet keine Credits), `platform` = Klonk-KI */
  source: aiMode().notNull(),
  model: text().notNull(),
  inputTokens: integer().notNull().default(0),
  outputTokens: integer().notNull().default(0),
  /** Kosten in Tausendstel-Credits; davon aus nachgekauften Credits (über das Monatskontingent hinaus) */
  millicredits: bigint({ mode: 'number' }).notNull().default(0),
  extraMillicredits: bigint({ mode: 'number' }).notNull().default(0),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('ai_usage_organization_idx').on(t.organizationId, t.createdAt),
  index('ai_usage_user_idx').on(t.userId, t.createdAt),
])

/** Nachgekaufte KI-Credits (Organisation oder Privatkonto) – schreibt nur der Abgleich mit klonk.* */
export const aiCreditGrants = pgTable('ai_credit_grants', {
  /** ID der Bestellung auf klonk.* (Abgleich ist dadurch wiederholbar) */
  id: text().primaryKey(),
  organizationId: uuid().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid().references(() => users.id, { onDelete: 'cascade' }),
  credits: integer().notNull(),
  validUntil: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

/** Lizenz-Token von Privatkonten (gehostete Plattform, Privat-Abo aus dem Shop) – schreibt nur der Abgleich mit klonk.* */
export const userLicenses = pgTable('user_licenses', {
  userId: uuid().primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  token: text().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

/** Rolle in einer Gruppe: Gruppenleitung (Lehrkräfte, mehrere möglich) oder Mitglied */
export const groupRole = pgEnum('group_role', ['leader', 'member'])

/** Gruppen einer Organisation (Klassen, Kurse, Ausbildungsgruppen) – jede hat einen gemeinsamen Cloud-Ordner */
export const groups = pgTable('groups', {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid().notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  /** Dürfen Mitglieder im gemeinsamen Ordner schreiben? (Gruppenleitung immer) */
  membersCanWrite: boolean().notNull().default(false),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('groups_organization_name_idx').on(t.organizationId, t.name)])

export const groupMembers = pgTable('group_members', {
  groupId: uuid().notNull().references(() => groups.id, { onDelete: 'cascade' }),
  userId: uuid().notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: groupRole().notNull().default('member'),
}, t => [primaryKey({ columns: [t.groupId, t.userId] }), index('group_members_user_idx').on(t.userId)])

/**
 * Klonk Cloud: Projekte eines Kontos oder der gemeinsame Ordner einer Gruppe (genau eins von beiden).
 * `revision` steigt mit jeder Änderung – Clients holen nur Änderungen seit ihrem Stand.
 */
export const cloudProjects = pgTable('cloud_projects', {
  id: uuid().primaryKey().defaultRandom(),
  ownerId: uuid().references(() => users.id, { onDelete: 'cascade' }),
  groupId: uuid().references(() => groups.id, { onDelete: 'cascade' }),
  /** Bearbeitung einer Aufgabe (Abgabe): die Gruppenleitung darf lesen */
  assignmentId: uuid().references((): AnyPgColumn => cloudAssignments.id, { onDelete: 'set null' }),
  name: text().notNull(),
  revision: bigint({ mode: 'number' }).notNull().default(0),
  /** Summe der Dateigrößen in Bytes (Kontingent) */
  size: bigint({ mode: 'number' }).notNull().default(0),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex('cloud_projects_owner_name_idx').on(t.ownerId, t.name).where(sql`${t.ownerId} IS NOT NULL`),
  uniqueIndex('cloud_projects_group_idx').on(t.groupId).where(sql`${t.groupId} IS NOT NULL`),
  index('cloud_projects_assignment_idx').on(t.assignmentId),
  check('cloud_projects_owner_or_group', sql`(${t.ownerId} IS NULL) <> (${t.groupId} IS NULL)`),
])

/** Dateien und (auch leere) Ordner; gelöschte bleiben als Grabstein, damit andere Geräte das Löschen mitbekommen */
export const cloudFiles = pgTable('cloud_files', {
  projectId: uuid().notNull().references(() => cloudProjects.id, { onDelete: 'cascade' }),
  path: text().notNull(),
  folder: boolean().notNull().default(false),
  content: text(),
  size: integer().notNull().default(0),
  deleted: boolean().notNull().default(false),
  /** Projekt-Revision der letzten Änderung */
  revision: bigint({ mode: 'number' }).notNull(),
  updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.projectId, t.path] }), index('cloud_files_revision_idx').on(t.projectId, t.revision)])

/** Aufgabe: Ordner im gemeinsamen Ordner einer Gruppe, den Mitglieder als eigenes Projekt bearbeiten und abgeben */
export const cloudAssignments = pgTable('cloud_assignments', {
  id: uuid().primaryKey().defaultRandom(),
  groupId: uuid().notNull().references(() => groups.id, { onDelete: 'cascade' }),
  path: text().notNull(),
  createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('cloud_assignments_group_path_idx').on(t.groupId, t.path)])
