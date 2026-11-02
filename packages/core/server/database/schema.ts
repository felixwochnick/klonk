import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

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
export const aiMode = pgEnum('ai_mode', ['inherit', 'off', 'server', 'webllm'])

/** KI-Einstellungen einer Organisation (Zeile entsteht beim ersten Speichern) */
export const organizationAiSettings = pgTable('organization_ai_settings', {
  organizationId: uuid().primaryKey().references(() => organizations.id, { onDelete: 'cascade' }),
  mode: aiMode().notNull().default('inherit'),
  // OpenAI-kompatibler Endpunkt, z. B. `https://llm.schule.de/v1`
  baseUrl: text(),
  model: text(),
  /** AES-GCM-verschlüsselt */
  apiKey: text(),
  webllmModel: text(),
  /** Lernende bekommen nur Hinweise statt fertiger Lösungen (Lehrkräfte/Admins immer volle Hilfe) */
  tutor: boolean().notNull().default(true),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

/** Lizenz-Token von Privatkonten (gehostete Plattform, Privat-Abo aus dem Shop) – schreibt nur der Abgleich mit klonk.* */
export const userLicenses = pgTable('user_licenses', {
  userId: uuid().primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  token: text().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})
