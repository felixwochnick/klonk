import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

export default createConfigForNuxt({
  features: {
    stylistic: true,
  },
}).prepend({
  // Mitgelieferter Java-Compiler (teavm-javac) und gebauter C#-Host – nicht selbst geschrieben
  ignores: ['teavm/**', 'dotnet/**'],
})
