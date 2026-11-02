import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Migrationen legen die clusterweite Rolle klonk_user an – Testdatenbanken nicht parallel aufsetzen
    fileParallelism: false,
  },
})
