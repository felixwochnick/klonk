import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const userRole = pgEnum('user_role', ['student', 'teacher', 'admin'])

export const schools = pgTable('schools', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  // Domain-Teil des Logins: username@domain
  domain: text().notNull().unique(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  schoolId: uuid().notNull().references(() => schools.id, { onDelete: 'cascade' }),
  username: text().notNull(),
  displayName: text().notNull(),
  role: userRole().notNull().default('student'),
  passwordHash: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex('users_school_username_idx').on(t.schoolId, t.username),
])
