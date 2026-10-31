import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/database/schema.ts',
  out: './server/database/migrations',
  casing: 'snake_case',
  dbCredentials: {
    url: process.env.NUXT_DATABASE_URL ?? 'postgres://klonk:klonk@localhost:5432/klonk',
  },
})
